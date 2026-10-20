const express = require('express');
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const authenticate = require('../middleware/authMiddleware');

const router = express.Router();

// Enforce authentication across all project endpoints
router.use(authenticate);

/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private
 */
router.post('/', projectController.createProject);

/**
 * @route   GET /api/projects
 * @desc    Get all projects accessible to the authenticated user (with search, filter, pagination)
 * @access  Private
 */
router.get('/', projectController.getProjects);

/**
 * @route   GET /api/projects/:projectId
 * @desc    Get single project details (owner or members only)
 * @access  Private
 */
router.get('/:projectId', projectController.getProjectById);

/**
 * @route   PATCH /api/projects/:projectId
 * @desc    Update project name, description, or status (owner only)
 * @access  Private
 */
router.patch('/:projectId', projectController.updateProject);

/**
 * @route   DELETE /api/projects/:projectId
 * @desc    Delete a project (owner only)
 * @access  Private
 */
router.delete('/:projectId', projectController.deleteProject);

/**
 * @route   POST /api/projects/:projectId/members
 * @desc    Add a team member to a project by email (owner only)
 * @access  Private
 */
router.post('/:projectId/members', projectController.addMember);

/**
 * @route   DELETE /api/projects/:projectId/members/:userId
 * @desc    Remove a team member from a project (owner only)
 * @access  Private
 */
router.delete('/:projectId/members/:userId', projectController.removeMember);

/**
 * @route   POST /api/projects/:projectId/tasks
 * @desc    Create a new task inside a project
 * @access  Private (Project members only)
 */
router.post('/:projectId/tasks', taskController.createTask);

/**
 * @route   GET /api/projects/:projectId/tasks
 * @desc    List tasks in a project (with status, priority, assignee, search, date filters, pagination)
 * @access  Private (Project members only)
 */
router.get('/:projectId/tasks', taskController.getProjectTasks);

module.exports = router;
