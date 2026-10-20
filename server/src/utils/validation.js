const mongoose = require('mongoose');

/**
 * Validates whether a given string is a valid 24-character hexadecimal MongoDB ObjectId
 * @param {string} id - The string to check
 * @returns {boolean} True if strictly valid, false otherwise
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
};

/**
 * Safely escapes special regular expression characters in user input
 * Prevents regex injection and crashes on characters like (, [, *, +, etc.
 * @param {string} str - Raw input string
 * @returns {string} Sanitized string safe for new RegExp
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Checks if a string or value can be parsed into a valid Date object
 * @param {any} val - Value to check
 * @returns {boolean} True if valid date, false otherwise
 */
const isValidDate = (val) => {
  if (!val) return false;
  const d = new Date(val);
  return d instanceof Date && !isNaN(d.getTime());
};

module.exports = {
  isValidObjectId,
  escapeRegex,
  isValidDate,
};
