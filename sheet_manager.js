const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const COMPANY_KEYS = ['company name', 'company', 'organisation', 'organization', 'business name'];
const EMAIL_KEYS = ['email', 'email id', 'email address', 'e-mail', 'contact email'];
const CONTACT_KEYS = ['contact person', 'contact name', 'person', 'name', 'decision maker'];
const DEMAND_KEYS = ['demand', 'requirement', 'need', 'problem', 'notes', 'inquiry', 'pain point', 'product fit'];
const STATUS_KEYS = ['status', 'workflow status', 'workflow_status', 'mail status', 'email status'];

function normalizeText(val) {
  return String(val || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function identifyColumns(rows) {
  if (!rows || rows.length === 0) return {};
  const sample = rows[0];
  const cols = Object.keys(sample);
  const mapping = {};

  for (const col of cols) {
    const norm = normalizeText(col);
    if (!mapping.company && COMPANY_KEYS.some((k) => norm.includes(k))) {
      mapping.company = col;
    } else if (!mapping.email && EMAIL_KEYS.some((k) => norm.includes(k))) {
      mapping.email = col;
    } else if (!mapping.contact && CONTACT_KEYS.some((k) => norm.includes(k))) {
      mapping.contact = col;
    } else if (!mapping.demand && DEMAND_KEYS.some((k) => norm.includes(k))) {
      mapping.demand = col;
    } else if (!mapping.status && STATUS_KEYS.some((k) => norm.includes(k))) {
      mapping.status = col;
    }
  }

  if (!mapping.company && cols.length > 1) {
    mapping.company = cols[1];
  }
  if (!mapping.email) {
    for (const col of cols) {
      if (col.toLowerCase().includes('email') || col.toLowerCase().includes('@')) {
        mapping.email = col;
        break;
      }
    }
  }

  return mapping;
}

function loadDataFile(filePathOrBuffer) {
  try {
    let workbook;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      workbook = xlsx.read(filePathOrBuffer, { type: 'buffer' });
    } else if (typeof filePathOrBuffer === 'string') {
      if (!fs.existsSync(filePathOrBuffer)) return [];
      workbook = xlsx.readFile(filePathOrBuffer);
    } else {
      return [];
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
    return data;
  } catch (err) {
    console.error('loadDataFile error:', err.message);
    return [];
  }
}

function saveDataFile(rows, filePath) {
  try {
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Leads');
    xlsx.writeFile(workbook, filePath);
    return true;
  } catch (err) {
    console.error('saveDataFile error:', err.message);
    return false;
  }
}

function ensureWorkflowColumns(rows) {
  const requiredCols = [
    'Company Name',
    'Contact Person',
    'Email',
    'Demand',
    'Generated Subject',
    'Generated Email Body',
    'Status',
    'Sent Timestamp',
  ];

  return rows.map((row) => {
    const updated = { ...row };
    for (const col of requiredCols) {
      if (updated[col] === undefined || updated[col] === null) {
        updated[col] = '';
      } else {
        updated[col] = String(updated[col]);
      }
    }
    return updated;
  });
}

module.exports = {
  identifyColumns,
  loadDataFile,
  saveDataFile,
  ensureWorkflowColumns,
};
