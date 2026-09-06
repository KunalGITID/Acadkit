/**
 * AcadKit portal sync — bookmarklet source.
 *
 * Runs on an SRM Academia page that shows your attendance and/or marks,
 * scrapes the tables, shows you what it found, and on confirmation writes
 * to Supabase via PostgREST.
 *
 * It never sees your SRM password: it runs inside the page you already
 * logged into. Build with `node scripts/portal-sync/build.mjs --pin 1234`.
 *
 * Parsing matches on HEADER TEXT, not DOM paths, because Zoho Creator
 * regenerates class names between deploys. If a table shape changes, the
 * preview panel shows nothing rather than writing something wrong.
 */
import {
  cellsOf,
  classify,
  findDetailTable,
  low,
  norm,
  num,
  RE_DETAIL_BTN,
  rowsOf,
  scrapeAttendance,
  scrapeComponents,
  scrapeMarks,
  splitPair,
  tablesIn as tables,
  diagnose as sharedDiagnose,
} from "../../src/lib/portal/parse";

(function () {
  "use strict";

  var CFG = {
    ingest: "__INGEST_URL__",
    secret: "__INGEST_SECRET__",
    pin: "__PIN__",
  };

  // Built by `build.mjs --diagnostics`: no credentials are inlined and the
  // panel only reports what it sees, so the capture step can be run on a
  // portal we haven't taught the parser yet without handling any secrets.
  var DIAG_ONLY = __DIAG_ONLY__;

  var norm = function (s) {
    return String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  };
  var low = function (s) {
    return norm(s).toLowerCase();
  };
  var num = function (s) {
    var m = norm(s).match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  /** Today in the browser's timezone as YYYY-MM-DD (en-CA is ISO-shaped). */
  var today = function () {
    return new Date().toLocaleDateString("en-CA");
  };

  // ---------- document collection ----------

  /**
   * The main document plus any same-origin iframes. Academia sometimes
   * renders the report inside a frame; a cross-origin one throws on access
   * and is counted so the panel can explain the empty result.
   */
  function documents() {
    var docs = [document];
    var blocked = 0;
    var frames = document.querySelectorAll("iframe, frame");
    for (var i = 0; i < frames.length; i++) {
      try {
        var d = frames[i].contentDocument;
        if (d && d.querySelector) docs.push(d);
        else blocked++;
      } catch (e) {
        blocked++;
      }
    }
    return { docs: docs, blocked: blocked };
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /**
   * Poll for the open modal's component table. `prev` is the text of the
   * last one read, so a modal that hasn't repainted yet isn't scraped
   * twice under the wrong subject.
   */
  /**
   * Bootstrap marks an open modal with `.show` (`.in` on v3). offsetParent
   * is not a usable signal here — it reads null on this portal's modal
   * even while it's on screen.
   */
  function isOpen(el) {
    return !!(el.className && /(^|\s)(show|in)(\s|$)/.test(el.className));
  }

  function awaitModal(prev, tries) {
    var mods = document.querySelectorAll(".modal");
    for (var i = 0; i < mods.length; i++) {
      if (!isOpen(mods[i])) continue;
      var tbl = mods[i].querySelectorAll("table");
      for (var j = 0; j < tbl.length; j++) {
        var hs = headers(tbl[j]);
        if (col(hs, RE_COMPONENT) < 0) continue;
        var text = norm(tbl[j].textContent);
        if (text && text !== prev) return Promise.resolve({ table: tbl[j], text: text });
      }
    }
    if (tries <= 0) return Promise.resolve(null);
    return sleep(250).then(function () { return awaitModal(prev, tries - 1); });
  }

  function closeModal() {
    var btn = document.querySelector(
      ".modal.show [data-dismiss='modal'], .modal.show [data-bs-dismiss='modal']"
    );
    if (btn) btn.click();
    return sleep(400);
  }

  /**
   * Open each subject's modal in turn and read its components. Clicking
   * is the only way in — calling the portal's own handler directly
   * throws on its jQuery build ($.post(...).error is not a function).
   */
  function collectComponentMarks(all, log) {
    var found = findDetailTable(all);
    if (!found) return Promise.resolve([]);

    var rows = bodyRows(found.table);
    var out = [];
    var prev = "";

    function step(i) {
      if (i >= rows.length) return Promise.resolve(out);
      var c = cellsOf(rows[i]);
      var btn = rows[i].querySelector(RE_DETAIL_BTN);
      var code = c && c.length > found.iCode
        ? norm(c[found.iCode].textContent).toUpperCase()
        : "";
      if (!btn || !code) return step(i + 1);

      btn.click();
      return awaitModal(prev, 20)
        .then(function (hit) {
          if (!hit) {
            if (log) log("No component detail opened for " + code + " — skipped.");
            return;
          }
          prev = hit.text;
          var got = scrapeComponents([hit.table], code);
          for (var k = 0; k < got.length; k++) out.push(got[k]);
        })
        .then(closeModal)
        .then(function () { return step(i + 1); });
    }

    return step(0);
  }

  // ---------- write (via the portal-ingest edge function) ----------

  /**
   * The bookmarklet used to write straight to PostgREST with the anon
   * key. Once RLS became owner-scoped, anon lost every policy and those
   * writes began failing with 42501.
   *
   * It posts to an edge function now, which writes with the service
   * role. The embedded secret grants exactly one capability — submit
   * portal data for one device_id — instead of the full-account access
   * a Supabase refresh token would have meant. That matters here more
   * than usual: a bookmarklet's URL is visible in the browser's
   * bookmark manager and syncs between devices.
   */
  function push(attendance, marks, log) {
    return fetch(CFG.ingest, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": CFG.secret,
      },
      body: JSON.stringify({
        device_id: CFG.pin,
        attendance: attendance,
        marks: marks,
      }),
    })
      .then(function (res) {
        return res.text().then(function (txt) {
          var body;
          try { body = JSON.parse(txt); } catch (e) { body = { error: txt }; }
          if (!res.ok) {
            throw new Error(
              res.status === 401
                ? "Rejected — rebuild the bookmarklet (node scripts/portal-sync/build.mjs --pin <PIN>)"
                : "HTTP " + res.status + " — " + (body.error || res.statusText)
            );
          }
          return body;
        });
      })
      .then(function (result) {
        if (result.snapshots) log("Attendance: " + result.snapshots + " subjects saved.");
        if (result.marksAdded || result.marksUpdated) {
          log("Marks: " + result.marksAdded + " added, " + result.marksUpdated + " updated.");
        }
        if (!result.snapshots && !result.marksAdded && !result.marksUpdated) {
          log("Nothing to save from this page.");
        }
        log("Open AcadKit — it refreshes on its own.");
      });
  }

  // ---------- diagnostics ----------

  /**
   * A description of every table on the page: headers, plus a couple of
   * sample rows with cell text truncated. This is what to send when the
   * scrapers come up empty on a portal whose markup we haven't seen.
   */
  /**
   * Repeating non-<table> structures, for portals that lay their reports
   * out in divs. Without this a table-less page yields an empty dump, which
   * says only that the parser found nothing and not what is actually there.
   *
   * A candidate is any container whose element children repeat a tag+class
   * signature at least three times, each with 2+ children of its own.
   */
  /** Context only the live page can supply; the rest is shared. */
  function diagnose(found, all) {
    return sharedDiagnose(found.docs, all, {
      url: location.origin + location.pathname,
      // The JSP portal routes on the hash, so the fragment is the only
      // record of which report was actually on screen when this ran.
      hash: location.hash || "",
      title: document.title,
      documents: found.docs.length,
      blockedFrames: found.blocked,
    });
  }

  // ---------- panel ----------

  function panel(attendance, marks, note, diag) {
    var host = document.getElementById("acadkit-sync-host");
    if (host) host.remove();
    host = document.createElement("div");
    host.id = "acadkit-sync-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    var rows = "";
    attendance.forEach(function (a) {
      var pct = a.conducted ? ((a.conducted - a.absent) / a.conducted) * 100 : 0;
      rows +=
        "<tr><td>" + a.subject_code + "</td><td>attendance</td><td>" +
        (a.conducted - a.absent) + "/" + a.conducted + " · " + pct.toFixed(1) + "%" +
        (a.percentage !== null ? " <i>(portal: " + a.percentage + "%)</i>" : "") +
        "</td></tr>";
    });
    marks.forEach(function (m) {
      rows +=
        "<tr><td>" + m.subject_code + "</td><td>" + m.label + "</td><td>" +
        m.marks_obtained + "/" + m.max_marks + "</td></tr>";
    });
    if (!rows) rows = "<tr><td colspan=3 class=empty>Nothing recognised on this page.</td></tr>";

    root.innerHTML =
      "<style>" +
      ":host{all:initial}*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
      ".bg{position:fixed;inset:0;background:rgba(15,17,21,.55);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".card{background:#fff;color:#14161a;border-radius:16px;max-width:560px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35)}" +
      "h2{margin:0;padding:18px 20px 6px;font-size:16px}" +
      "p.note{margin:0;padding:0 20px 12px;font-size:12.5px;color:#5b616e;line-height:1.5}" +
      ".scroll{overflow:auto;padding:0 20px;flex:1}" +
      "table{width:100%;border-collapse:collapse;font-size:12.5px}" +
      "td{padding:7px 6px;border-top:1px solid #eceef2;vertical-align:top}" +
      "td:first-child{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}" +
      "td:last-child{text-align:right;white-space:nowrap}" +
      "i{color:#8b909c;font-style:normal}.empty{text-align:center;color:#8b909c;padding:22px}" +
      ".foot{display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #eceef2}" +
      "button{font-size:13px;font-weight:600;padding:9px 16px;border-radius:9px;border:0;cursor:pointer}" +
      ".x{background:#eef0f4;color:#3a3f4a}.go{background:#7c6af7;color:#fff}.go[disabled]{opacity:.5;cursor:default}" +
      "#log{padding:0 20px 4px;font-size:12px;color:#5b616e;white-space:pre-line}" +
      "</style>" +
      "<div class=bg><div class=card>" +
      "<h2>AcadKit — " + (DIAG_ONLY ? "portal diagnostics" : "sync from portal") + "</h2>" +
      "<p class=note>" + note + "</p>" +
      "<div class=scroll><table>" + rows + "</table></div>" +
      "<div id=log></div>" +
      "<div class=foot><button class=x id=diag>Copy diagnostics</button>" +
      "<span style=flex:1></span>" +
      "<button class=x id=cancel>Close</button>" +
      (DIAG_ONLY
        ? ""
        : "<button class=go id=go" + (rows.indexOf("empty") > -1 ? " disabled" : "") +
          ">Sync to AcadKit</button>") +
      "</div></div></div>";

    var logEl = root.getElementById("log");
    var log = function (line) {
      logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    };

    root.getElementById("cancel").onclick = function () {
      host.remove();
    };

    var showDiag = function () {
      // Shown in a textarea as well as copied: clipboard access is blocked
      // in some embedded contexts, and this must never silently do nothing.
      var box = root.querySelector(".scroll");
      box.innerHTML =
        "<p style='font-size:12px;color:#5b616e'>Check this over for anything personal, " +
        "then send it along — it's what's needed to teach the parser this portal.</p>" +
        "<textarea readonly style='width:100%;height:260px;font:11px ui-monospace,Menlo,monospace;" +
        "border:1px solid #dcdfe6;border-radius:8px;padding:8px'></textarea>";
      var ta = box.querySelector("textarea");
      ta.value = diag;
      ta.focus();
      ta.select();
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(diag);
      } catch (e) {
        /* textarea selection is the fallback */
      }
    };
    root.getElementById("diag").onclick = showDiag;

    if (DIAG_ONLY) {
      // Nothing to preview and nothing to write — the dump is the payload.
      showDiag();
      return;
    }

    root.getElementById("go").onclick = function () {
      var btn = root.getElementById("go");
      btn.disabled = true;
      btn.textContent = "Syncing…";
      push(attendance, marks, log)
        .then(function () {
          btn.textContent = "Done";
          log("Open AcadKit — it refreshes on its own.");
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = "Retry";
          log("Failed: " + err.message);
        });
    };
  }

  // ---------- go ----------

  // Tests drive the scrapers directly against fixture markup; the panel
  // and the network calls are not exercised there.
  if (typeof window !== "undefined" && window.__ACADKIT_SYNC_TEST__) {
    window.__acadkitSync = {
      scrapeAttendance: scrapeAttendance,
      scrapeMarks: scrapeMarks,
      scrapeComponents: scrapeComponents,
      collectComponentMarks: collectComponentMarks,
      findDetailTable: findDetailTable,
      splitPair: splitPair,
      tables: tables,
      documents: documents,
      classify: classify,
      splitHead: splitHead,
      diagnose: diagnose,
    };
    return;
  }

  var found = documents();
  var all = tables(found.docs);
  var attendance = scrapeAttendance(all);
  var marks = scrapeMarks(all);

  // Portals that hide components behind a per-subject modal read as zero
  // marks on the summary page. Walk the modals before deciding there's
  // nothing here.
  if (!marks.length && findDetailTable(all)) {
    collectComponentMarks(all, null).then(function (got) {
      render(attendance, got);
    });
    return;
  }

  render(attendance, marks);

  function render(attendance, marks) {
  var note;
  if (attendance.length || marks.length) {
    note =
      "Read " + attendance.length + " attendance row(s) and " + marks.length +
      " mark(s) from this page. Check them, then sync. Attendance is stored as a " +
      "snapshot — classes you marked by hand after today still count on top.";
  } else if (found.blocked) {
    note =
      "Found " + all.length + " table(s) but nothing recognisable, and " + found.blocked +
      " frame(s) on this page are cross-origin so their contents can't be read. " +
      "Try right-clicking the report → “This Frame” → “Open Frame in New Tab”, then run this again.";
  } else {
    note =
      "Scanned " + all.length + " table(s) on this page and found no attendance or marks " +
      "columns. Open the Attendance / Marks report first and run this again — or hit " +
      "“Copy diagnostics” to capture this page's table structure.";
  }

    panel(attendance, marks, note, diagnose(found, all));
  }
})();
