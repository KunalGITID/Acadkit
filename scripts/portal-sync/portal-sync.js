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
(function () {
  "use strict";

  var CFG = {
    url: "__SUPABASE_URL__",
    key: "__SUPABASE_ANON_KEY__",
    pin: "__PIN__",
  };

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

  function tables(docs) {
    var out = [];
    for (var i = 0; i < docs.length; i++) {
      var found = docs[i].querySelectorAll("table");
      for (var j = 0; j < found.length; j++) out.push(found[j]);
    }
    return out;
  }

  /** Direct element children of `el` whose tag is in `tags`. */
  function kids(el, tags) {
    var out = [];
    var children = el.children || [];
    for (var i = 0; i < children.length; i++) {
      if (tags.indexOf(children[i].tagName.toLowerCase()) > -1) out.push(children[i]);
    }
    return out;
  }

  /**
   * A table's own rows, in document order, walking children explicitly
   * rather than using `table.rows` — that property would also hand back
   * rows belonging to tables nested inside a cell, which the marks report
   * is full of.
   */
  function rowsOf(table) {
    var out = [];
    var children = table.children || [];
    for (var i = 0; i < children.length; i++) {
      var tag = children[i].tagName.toLowerCase();
      if (tag === "tr") out.push(children[i]);
      else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
        var trs = kids(children[i], ["tr"]);
        for (var j = 0; j < trs.length; j++) out.push(trs[j]);
      }
    }
    return out;
  }

  function cellsOf(tr) {
    return kids(tr, ["td", "th"]);
  }

  /** Header labels for a table: <thead> cells, else the first row. */
  function headers(table) {
    var head = kids(table, ["thead"])[0];
    var row = head ? kids(head, ["tr"])[0] : rowsOf(table)[0];
    if (!row) return [];
    var cells = cellsOf(row);
    var out = [];
    for (var i = 0; i < cells.length; i++) out.push(low(cells[i].textContent));
    return out;
  }

  /**
   * Index of the first header matching `re`, or -1. `not` skips headers
   * that would otherwise be claimed by a broader pattern — "Total Hours
   * Absent" reads as both a conducted and an absent column otherwise.
   */
  function col(hs, re, not) {
    for (var i = 0; i < hs.length; i++) {
      if (not && not.test(hs[i])) continue;
      if (re.test(hs[i])) return i;
    }
    return -1;
  }

  /** Body rows, skipping the row that was consumed as the header. */
  function bodyRows(table) {
    var all = rowsOf(table);
    var head = kids(table, ["thead"])[0];
    if (head) {
      // Header lives in its own section, so every row here is data.
      var headRows = kids(head, ["tr"]);
      return all.slice(headRows.length);
    }
    return all.slice(1);
  }

  // ---------- attendance ----------

  var RE_CODE = /course\s*code|subject\s*code|^code$/;
  var RE_CONDUCTED = /conducted|max.*hour|total\s*(?:class|hour)/;
  var RE_ABSENT = /absent/;
  var RE_PCT = /%|percent/;

  function scrapeAttendance(all) {
    for (var t = 0; t < all.length; t++) {
      var hs = headers(all[t]);
      var iCode = col(hs, RE_CODE);
      var iCond = col(hs, RE_CONDUCTED, RE_ABSENT);
      var iAbs = col(hs, RE_ABSENT);
      if (iCode < 0 || iCond < 0 || iAbs < 0) continue;

      var iPct = col(hs, RE_PCT);
      var rows = bodyRows(all[t]);
      var out = [];
      for (var r = 0; r < rows.length; r++) {
        var c = cellsOf(rows[r]);
        if (!c || c.length <= Math.max(iCode, iCond, iAbs)) continue;
        var code = norm(c[iCode].textContent).toUpperCase();
        var conducted = num(c[iCond].textContent);
        var absent = num(c[iAbs].textContent);
        if (!code || conducted === null || absent === null) continue;
        out.push({
          subject_code: code,
          conducted: conducted,
          absent: absent,
          percentage: iPct >= 0 && c[iPct] ? num(c[iPct].textContent) : null,
        });
      }
      if (out.length) return out;
    }
    return [];
  }

  // ---------- marks ----------

  var RE_PERF = /test\s*performance|performance|marks?\b/;

  function classify(label) {
    var l = low(label);
    if (/^(ct|pt|cycle|periodical|unit\s*test)/.test(l)) return "CT";
    if (/lab|practical|experiment/.test(l)) return "Lab";
    if (/assign|hw|homework/.test(l)) return "Assignment";
    if (/project|model|mini/.test(l)) return "Project";
    return "CT";
  }

  /** "CT1/50.00" -> { label: "CT1", max: 50 }, else null. */
  function splitHead(text) {
    var m = norm(text).match(/^(.+?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    var label = norm(m[1]);
    if (!label) return null;
    return { label: label, max: parseFloat(m[2]) };
  }

  /**
   * A performance cell holds one mini-table per test: a header cell
   * "CT1/50.00" over a value cell "34.00". Absent shows as "Abs".
   */
  function parsePerf(cell) {
    var out = [];
    var nested = cell.querySelectorAll("table");
    for (var n = 0; n < nested.length; n++) {
      var rows = rowsOf(nested[n]);
      if (rows.length < 2) continue;
      var heads = cellsOf(rows[0]);
      var vals = cellsOf(rows[1]);
      for (var i = 0; i < heads.length; i++) {
        var h = splitHead(heads[i].textContent);
        if (!h || i >= vals.length) continue;
        var raw = norm(vals[i].textContent);
        var obtained = /^abs/i.test(raw) ? 0 : num(raw);
        if (obtained === null) continue;
        out.push({ label: h.label, max: h.max, obtained: obtained });
      }
    }
    if (out.length) return out;

    // Fallback for flat markup. Requires whitespace between max and
    // obtained — without it "50.0034.00" is genuinely ambiguous, and
    // reporting nothing beats writing a wrong mark.
    var re = /([A-Za-z][A-Za-z0-9 ._-]{0,23}?)\s*\/\s*(\d+(?:\.\d+)?)\s+(Abs(?:ent)?|\d+(?:\.\d+)?)/gi;
    var text = norm(cell.textContent);
    var m;
    while ((m = re.exec(text)) !== null) {
      out.push({
        label: norm(m[1]),
        max: parseFloat(m[2]),
        obtained: /^abs/i.test(m[3]) ? 0 : parseFloat(m[3]),
      });
    }
    return out;
  }

  function scrapeMarks(all) {
    for (var t = 0; t < all.length; t++) {
      var hs = headers(all[t]);
      var iCode = col(hs, RE_CODE);
      var iPerf = col(hs, RE_PERF);
      // Skip the attendance table, which also has a course-code column.
      if (iCode < 0 || iPerf < 0 || col(hs, RE_CONDUCTED, RE_ABSENT) >= 0) continue;

      var rows = bodyRows(all[t]);
      var out = [];
      for (var r = 0; r < rows.length; r++) {
        var c = cellsOf(rows[r]);
        if (!c || c.length <= Math.max(iCode, iPerf)) continue;
        var code = norm(c[iCode].textContent).toUpperCase();
        if (!code) continue;
        var tests = parsePerf(c[iPerf]);
        for (var k = 0; k < tests.length; k++) {
          out.push({
            subject_code: code,
            label: tests[k].label,
            max_marks: tests[k].max,
            marks_obtained: tests[k].obtained,
            component_type: classify(tests[k].label),
          });
        }
      }
      if (out.length) return out;
    }
    return [];
  }

  // ---------- supabase (PostgREST) ----------

  function rest(path, opts) {
    opts = opts || {};
    var headersObj = {
      apikey: CFG.key,
      Authorization: "Bearer " + CFG.key,
      "Content-Type": "application/json",
    };
    if (opts.prefer) headersObj.Prefer = opts.prefer;
    return fetch(CFG.url.replace(/\/$/, "") + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: headersObj,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          throw new Error("HTTP " + res.status + " — " + (txt || res.statusText));
        });
      }
      return res.status === 204 ? null : res.json().catch(function () { return null; });
    });
  }

  var q = encodeURIComponent;

  function push(attendance, marks, log) {
    var pin = CFG.pin;
    return rest("subjects?device_id=eq." + q(pin) + "&select=id,code").then(function (subjects) {
      var byCode = {};
      (subjects || []).forEach(function (s) {
        byCode[norm(s.code).toUpperCase()] = s.id;
      });

      var unknown = {};
      var stamp = today();

      var snapshots = attendance.map(function (a) {
        return {
          device_id: pin,
          subject_code: a.subject_code,
          conducted: a.conducted,
          absent: a.absent,
          percentage: a.percentage,
          as_of: stamp,
          synced_at: new Date().toISOString(),
        };
      });

      var markRows = [];
      marks.forEach(function (m) {
        var id = byCode[m.subject_code];
        if (!id) {
          unknown[m.subject_code] = true;
          return;
        }
        markRows.push({
          device_id: pin,
          subject_id: id,
          component_type: m.component_type,
          label: m.label,
          marks_obtained: m.marks_obtained,
          max_marks: m.max_marks,
          is_external: false,
          source: "portal",
        });
      });

      var steps = [];

      if (snapshots.length) {
        steps.push(
          rest("portal_snapshots?on_conflict=device_id,subject_code", {
            method: "POST",
            body: snapshots,
            prefer: "resolution=merge-duplicates,return=minimal",
          }).then(function () {
            log("Attendance: " + snapshots.length + " subjects saved.");
          })
        );
      }

      if (markRows.length) {
        // Reconcile client-side instead of upserting: the portal-marks
        // unique index is partial, which PostgREST can't target, and this
        // way rows typed in by hand are never touched.
        steps.push(
          rest(
            "marks?device_id=eq." + q(pin) + "&source=eq.portal&select=id,subject_id,label"
          ).then(function (existing) {
            var seen = {};
            (existing || []).forEach(function (e) {
              seen[e.subject_id + "|" + norm(e.label).toLowerCase()] = e.id;
            });
            var inserts = [];
            var patches = [];
            markRows.forEach(function (row) {
              var id = seen[row.subject_id + "|" + norm(row.label).toLowerCase()];
              if (id) {
                patches.push(
                  rest("marks?id=eq." + q(id), {
                    method: "PATCH",
                    body: {
                      marks_obtained: row.marks_obtained,
                      max_marks: row.max_marks,
                      component_type: row.component_type,
                    },
                    prefer: "return=minimal",
                  })
                );
              } else {
                inserts.push(row);
              }
            });
            var work = patches.slice();
            if (inserts.length) {
              work.push(
                rest("marks", {
                  method: "POST",
                  body: inserts,
                  prefer: "return=minimal",
                })
              );
            }
            return Promise.all(work).then(function () {
              log(
                "Marks: " + inserts.length + " added, " + patches.length + " updated."
              );
            });
          })
        );
      }

      return Promise.all(steps).then(function () {
        var codes = Object.keys(unknown);
        if (codes.length) {
          log("Marks skipped — no matching subject in AcadKit: " + codes.join(", "));
        }
      });
    });
  }

  // ---------- panel ----------

  function panel(attendance, marks, note) {
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
      "<h2>AcadKit — sync from portal</h2>" +
      "<p class=note>" + note + "</p>" +
      "<div class=scroll><table>" + rows + "</table></div>" +
      "<div id=log></div>" +
      "<div class=foot><button class=x id=cancel>Cancel</button>" +
      "<button class=go id=go" + (rows.indexOf("empty") > -1 ? " disabled" : "") + ">Sync to AcadKit</button></div>" +
      "</div></div>";

    var logEl = root.getElementById("log");
    var log = function (line) {
      logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    };

    root.getElementById("cancel").onclick = function () {
      host.remove();
    };
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
      tables: tables,
      documents: documents,
      classify: classify,
      splitHead: splitHead,
    };
    return;
  }

  var found = documents();
  var all = tables(found.docs);
  var attendance = scrapeAttendance(all);
  var marks = scrapeMarks(all);

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
      "columns. Open the Attendance / Marks report first, then run this again.";
  }

  panel(attendance, marks, note);
})();
