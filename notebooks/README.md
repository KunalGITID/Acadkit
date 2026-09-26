# Notebooks

`acadkit_analysis.ipynb` analyses one semester from AcadKit's own export:
attendance habits (by weekday and class time), how your marks spread and the
empirical-Bayes prior the app's grade odds use, attendance against marks, the
portal's sync history, deadline load, and — once final grades exist — how well
the weekly grade forecasts were calibrated (Brier score, reliability chart).

## Run it

1. In AcadKit: **Settings → Data → Export everything as JSON**.
2. Either
   - **Colab (nothing to install):** open the notebook in
     [colab.research.google.com](https://colab.research.google.com), upload the
     export into the session's files, and *Runtime → Run all*; or
   - **Locally:**
     ```bash
     python3 -m venv .venv && . .venv/bin/activate
     pip install pandas matplotlib jupyter
     jupyter notebook notebooks/acadkit_analysis.ipynb
     ```
     with the export in `notebooks/`.

It picks up the newest `acadkit-export-*.json` next to it; set `ACADKIT_EXPORT`
to point at another file.

## Your data stays yours

The export is personal data. `notebooks/*.json` is gitignored so it can't be
committed by accident — keep it that way if you publish the notebook.
