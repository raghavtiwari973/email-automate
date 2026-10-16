import os
import time
import json
import logging
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from sheet_manager import load_data_file, save_data_file, identify_columns, ensure_workflow_columns
from agent_engine import GeminiAgent

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("Watcher")

ROOT = Path(__file__).resolve().parent
PROFILE_PATH = ROOT / "company_profile.json"

class LeadFileHandler(FileSystemEventHandler):
    def __init__(self, target_file: Path, agent: GeminiAgent):
        super().__init__()
        self.target_file = target_file.resolve()
        self.agent = agent
        self.last_modified = 0

    def on_modified(self, event):
        path = Path(event.src_path).resolve()
        if path == self.target_file:
            # Debounce rapid save events
            current_time = time.time()
            if current_time - self.last_modified < 2.0:
                return
            self.last_modified = current_time
            logger.info(f"Detected modification in: {path.name}")
            self.process_leads()

    def process_leads(self):
        try:
            time.sleep(0.5) # Wait for file lock release
            df = load_data_file(self.target_file)
            if df.empty:
                return

            cols = identify_columns(df)
            df = ensure_workflow_columns(df)

            sender_profile = {}
            if PROFILE_PATH.exists():
                with open(PROFILE_PATH, "r", encoding="utf-8") as f:
                    sender_profile = json.load(f)

            updated = False
            for idx, row in df.iterrows():
                status = str(row.get("Status", "")).strip().lower()
                # Only process new/unprocessed rows
                if status in ["", "nan", "pending", "none"]:
                    company = str(row.get(cols.get("company", "Company Name"), "")).strip()
                    email = str(row.get(cols.get("email", "Email"), "")).strip()
                    contact = str(row.get(cols.get("contact", "Contact Person"), "")).strip()
                    demand = str(row.get(cols.get("demand", "Demand"), "")).strip()

                    if not company and not email:
                        continue

                    lead_info = {
                        "company_name": company,
                        "contact_person": contact,
                        "email": email,
                        "demand": demand
                    }

                    logger.info(f"Generating personalized email for: {company} ({email})")
                    result = self.agent.generate_cold_email(lead_info, sender_profile)

                    df.at[idx, "Generated Subject"] = result.get("subject", "")
                    df.at[idx, "Generated Email Body"] = result.get("body", "")
                    df.at[idx, "Status"] = "Ready for Review"
                    updated = True

            if updated:
                save_data_file(df, self.target_file)
                logger.info(f"Successfully updated {self.target_file.name} with AI drafts!")
        except Exception as e:
            logger.error(f"Error processing leads: {e}")

def start_watcher(file_path: Path):
    agent = GeminiAgent()
    event_handler = LeadFileHandler(file_path, agent)
    # Run immediate scan on start
    event_handler.process_leads()

    observer = Observer()
    observer.schedule(event_handler, path=str(file_path.parent), recursive=False)
    observer.start()
    logger.info(f"Started monitoring '{file_path.name}'. Make changes and save to trigger agent automatically.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Watch Excel/CSV file and auto-generate cold emails.")
    parser.add_argument("--file", default="leads.xlsx", help="File to watch (e.g., leads.xlsx or leads.csv)")
    args = parser.parse_args()

    watch_target = ROOT / args.file
    if not watch_target.exists():
        # Fallback to leads.csv if leads.xlsx doesn't exist
        csv_fallback = ROOT / "leads.csv"
        if csv_fallback.exists():
            watch_target = csv_fallback

    start_watcher(watch_target)
