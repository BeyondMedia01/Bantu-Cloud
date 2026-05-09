const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// ─── Built-in skills dictionary ───────────────────────────────────────────────
const SKILLS_DB = new Set([
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'ruby', 'php', 'go', 'rust', 'swift', 'kotlin',
  'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring', 'asp.net', 'laravel',
  'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap', 'jquery',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'ci/cd',
  'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
  'agile', 'scrum', 'kanban', 'waterfall',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'tensorflow', 'pytorch', 'keras',
  'data analysis', 'data science', 'tableau', 'power bi', 'excel', 'spreadsheets',
  'project management', 'product management', 'leadership', 'team management',
  'communication', 'problem solving', 'critical thinking', 'analytical',
  'sales', 'marketing', 'customer service', 'account management', 'business development',
  'accounting', 'bookkeeping', 'payroll', 'audit', 'tax', 'financial analysis',
  'human resources', 'recruiting', 'onboarding', 'employee relations', 'performance management',
  'graphic design', 'ui/ux', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator',
  'content writing', 'copywriting', 'seo', 'sem', 'social media', 'email marketing',
  'rest api', 'graphql', 'microservices', 'soa', 'event-driven', 'message queue', 'rabbitmq', 'kafka',
  'testing', 'jest', 'mocha', 'cypress', 'selenium', 'unit test', 'integration test', 'e2e',
  'linux', 'unix', 'bash', 'powershell', 'nginx', 'apache', 'iis',
  'dart', 'flutter', 'react native', 'android', 'ios', 'xcode',
]);

const DEGREE_KEYWORDS = [
  { pattern: /ph\.?d\.?|doctorate|doctoral/i, level: 'phd' },
  { pattern: /master|msc|ma\s|mba|m\.sc/i, level: 'master' },
  { pattern: /bachelor|bs\s|ba\s|b\.sc|b\.a|b\.eng|btech|hnd/i, level: 'bachelor' },
  { pattern: /diploma|associate|nd\s|national diploma/i, level: 'diploma' },
  { pattern: /certificate|cert\b/i, level: 'certificate' },
  { pattern: /high school|secondary|a-level|o-level|gcse/i, level: 'high_school' },
];

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text || '';
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  if (ext === '.txt') {
    return buffer.toString('utf-8');
  }
  throw new Error(`Unsupported file format: ${ext}`);
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractPhone(text) {
  const m = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
  return m ? m[0].trim() : null;
}

function extractSkills(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const skill of SKILLS_DB) {
    if (lower.includes(skill)) {
      found.push({ name: skill, level: null });
    }
  }
  // Deduplicate by name
  const seen = new Set();
  return found.filter(s => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractEducation(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  let current = null;

  for (const line of lines) {
    for (const d of DEGREE_KEYWORDS) {
      if (d.pattern.test(line) && line.length < 200) {
        // Try to extract institution name from next line or current line
        const institution = line.replace(d.pattern, '').replace(/[,;].*$/, '').trim();
        if (current) results.push(current);
        current = { degree: d.level, field: null, institution: institution || null };
        break;
      }
    }

    if (current && line.length < 150 && !current.institution && line !== current.institution) {
      // Check if this line looks like an institution name (no phone/email/url)
      if (!line.match(/@|http|\d{7,}/) && line.length > 3) {
        current.institution = line;
      }
    }

    // Check for degree fields
    if (current) {
      const fields = ['engineering', 'computer science', 'business', 'finance', 'accounting',
        'marketing', 'economics', 'mathematics', 'physics', 'chemistry', 'biology',
        'psychology', 'sociology', 'information technology', 'information systems'];
      for (const f of fields) {
        if (line.toLowerCase().includes(f) && line.length < 120) {
          current.field = f;
          break;
        }
      }
    }
  }
  if (current) results.push(current);
  return results;
}

function extractExperience(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Try to identify job titles: common prefix patterns
    const titleMatch = line.match(/^(?:.*?(?:at|@|–|—|-)\s*)?(.+?)\s*(?:at|@|–|—|-)\s*(.+)/);
    if (titleMatch && line.length < 150) {
      if (current) results.push(current);
      current = {
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim(),
        startDate: null,
        endDate: null,
        current: false,
        description: null,
      };

      // Check for date ranges in the same line
      const dateMatch = line.match(/(\d{4})\s*[-–—to]+\s*(\d{4}|present|now|current)/i);
      if (dateMatch) {
        current.startDate = dateMatch[1] + '-01-01';
        const endVal = dateMatch[2].toLowerCase();
        if (endVal === 'present' || endVal === 'now' || endVal === 'current') {
          current.current = true;
          current.endDate = null;
        } else {
          current.endDate = endVal + '-01-01';
        }
      }
      continue;
    }

    // Check for date ranges on standalone lines
    if (current) {
      const dateOnly = line.match(/^(\d{4})\s*[-–—to]+\s*(\d{4}|present|now|current)/i);
      if (dateOnly) {
        current.startDate = dateOnly[1] + '-01-01';
        const endVal = dateOnly[2].toLowerCase();
        if (endVal === 'present' || endVal === 'now' || endVal === 'current') {
          current.current = true;
          current.endDate = null;
        } else {
          current.endDate = endVal + '-01-01';
        }
        continue;
      }
    }

    // Accumulate description
    if (current && line.length > 20 && line.length < 500 && !line.match(/^\d{4}/)) {
      current.description = current.description
        ? current.description + ' ' + line
        : line;
    }
  }
  if (current) results.push(current);

  return results.map(exp => ({
    ...exp,
    durationMonths: exp.startDate
      ? estimateDuration(exp.startDate, exp.endDate)
      : null,
  }));
}

function estimateDuration(startStr, endStr) {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, months);
}

function estimateTotalYears(experiences) {
  let totalMonths = 0;
  for (const exp of experiences) {
    if (exp.durationMonths) totalMonths += exp.durationMonths;
  }
  return Math.round(totalMonths / 12 * 10) / 10;
}

// ─── Main parse function ──────────────────────────────────────────────────────

async function parseResume(filePath) {
  const text = await extractText(filePath);

  const skills = extractSkills(text);
  const educations = extractEducation(text);
  const experiences = extractExperience(text);
  const totalYears = estimateTotalYears(experiences);

  return {
    text,
    email: extractEmail(text),
    phone: extractPhone(text),
    skills,
    educations,
    experiences,
    totalYears,
  };
}

// ─── Screening / scoring ───────────────────────────────────────────────────────

function scoreCandidate(parsed, jobRequirements, jobTitle) {
  const lowerReq = (jobRequirements || '').toLowerCase();
  const lowerTitle = (jobTitle || '').toLowerCase();
  const combined = lowerTitle + ' ' + lowerReq;

  // Extract key terms from requirements
  const words = combined
    .replace(/[.,#!?$%^&*;:{}=_`~()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase());

  // Unique requirement terms for matching
  const reqTerms = new Set(words);
  const reqTermsArr = [...reqTerms];
  const nTerms = reqTermsArr.length;

  if (nTerms === 0) return 50; // No requirements to match against

  // Count matches in skills and text
  const candidateText = parsed.skills.map(s => s.name.toLowerCase()).join(' ');
  let matches = 0;

  for (const term of reqTermsArr) {
    // Skip very common words
    if (['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'will', 'were', 'what'].includes(term)) continue;

    if (candidateText.includes(term) || (parsed.text && parsed.text.toLowerCase().includes(term))) {
      matches++;
    }
  }

  // Experience bonus
  const expBonus = Math.min(parsed.totalYears || 0, 15) * 1.5; // up to 22.5 extra

  // Education bonus
  const eduLevels = { phd: 10, master: 8, bachelor: 5, diploma: 3, certificate: 1, high_school: 0 };
  let eduScore = 0;
  for (const edu of parsed.educations || []) {
    eduScore = Math.max(eduScore, eduLevels[edu.degree] || 0);
  }

  const matchRatio = matches / nTerms;
  const rawScore = (matchRatio * 60) + eduScore + expBonus;
  const finalScore = Math.min(100, Math.round(rawScore));

  return finalScore;
}

module.exports = { parseResume, scoreCandidate, extractText };
