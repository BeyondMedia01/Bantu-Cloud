/**
 * Lightweight validation helpers.
 * Each validator returns { ok: true } or { ok: false, message: string }.
 */

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
const isPositiveNumber = (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0;
const isNonNegativeNumber = (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0;
const isValidDate = (v) => !isNaN(Date.parse(v));

/**
 * Validate a plain object against a schema.
 *
 * Schema format:
 *   { fieldName: { required?, type?, min?, max?, isEmail?, isDate? } }
 *
 * @param {object} data   - req.body or any object
 * @param {object} schema
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validate(data, schema) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const present = value !== undefined && value !== null && value !== '';

    if (rules.required && !present) {
      errors.push(`${field} is required`);
      continue; // skip further checks if absent
    }
    if (!present) continue;

    if (rules.isEmail && !isValidEmail(value)) {
      errors.push(`${field} must be a valid email address`);
    }

    if (rules.isDate && !isValidDate(value)) {
      errors.push(`${field} must be a valid date`);
    }

    if (rules.type === 'number') {
      const n = parseFloat(value);
      if (isNaN(n)) {
        errors.push(`${field} must be a number`);
      } else {
        if (rules.min !== undefined && n < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && n > rules.max) {
          errors.push(`${field} must be at most ${rules.max}`);
        }
      }
    }

    if (rules.type === 'string' && rules.minLength && String(value).length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Express middleware factory.
 * Usage: router.post('/', validateBody(schema), handler)
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { ok, errors } = validate(req.body, schema);
    if (!ok) return res.status(400).json({ message: errors[0], errors });
    next();
  };
}

module.exports = { validate, validateBody, isValidEmail, isPositiveNumber, isNonNegativeNumber, isValidDate };
