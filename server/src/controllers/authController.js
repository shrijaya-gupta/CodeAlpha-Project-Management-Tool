const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

/**
 * Generate a signed JSON Web Token for an authenticated user
 * @param {string} userId - MongoDB ObjectId string of user
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is missing from environment variables');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
  return jwt.sign({ id: userId }, jwtSecret, { expiresIn });
};

/**
 * @desc    Register a new user account
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    // 1. Check validation results from express-validator
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: validationErrors.array()[0].msg,
        errors: validationErrors.array(),
      });
    }

    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 2. Check if a user with this email already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address is already registered.',
      });
    }

    // 3. Create user (password will be automatically hashed by User schema pre-save hook)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    // 4. Generate JWT token
    const token = generateToken(user._id);

    // 5. Send safe response (never return password or password hash)
    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user and return JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    // 1. Check validation errors
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: validationErrors.array()[0].msg,
        errors: validationErrors.array(),
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 2. Query user including the password hash for comparison
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    // Return generic 401 error to avoid user enumeration attacks
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 3. Compare candidate password with stored bcrypt hash
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 4. Generate JWT token
    const token = generateToken(user._id);

    // 5. Return safe user data and authentication token
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently authenticated user's profile
 * @route   GET /api/auth/me
 * @access  Private (Requires valid JWT)
 */
const getMe = async (req, res) => {
  // req.user is set by authMiddleware and already excludes password
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
  });
};

module.exports = {
  register,
  login,
  getMe,
};
