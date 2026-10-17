# SAPCON Lead Workflow — fixed output validation

This version checks for empty model output and fills missing email subject/body with a generic, review-only fallback. It does not send email.

## Update existing project
1. Back up your current `main.py`.
2. Copy this `main.py` into `C:\Users\rt191\Music\ollama-work-flow`, replacing the old file.
3. Do not replace `leads.csv` or `tracking.csv`.
4. To rerun the existing test row and generate a fresh test draft, run:
   `python main.py --limit 5 --retry-ready`
5. Review the new draft in `drafts`. A generic fallback is not proof of product fit; the company details still need human review.

Normal run (new rows only):
`python main.py --limit 5`

The original `leads.csv` remains unchanged. Email sending stays disabled.

## Web Dashboard & Server (Node.js)

To run the interactive web dashboard and backend server:
```bash
npm start
```
or:
```bash
node server.js
```
The workbench will run on `http://localhost:8000`. It serves the frontend workbench and all API routes (`/api/leads`, `/api/queue`, `/auth/login`, etc.).

