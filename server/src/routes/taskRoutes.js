const express = require('express');
const taskController = require('../controllers/taskController');
const authenticate = require('../middleware/authMiddleware');

const router = express.Router();

// Enforce authentication across all task endpoints
router.use(authenticate);

/**
 * @route   GET /api/tasks/:taskId
 * @desc    Get single task details
 * @access  Private (Project members only)
 */
router.get('/:taskId', taskController.getTaskById);

/**
 * @route   PATCH /api/tasks/:taskId
 * @desc    Update task details (title, description, priority, status, dueDate)
 * @access  Private (Project members only)
 */
router.patch('/:taskId', taskController.updateTask);

/**
 * @route   PUT /api/tasks/:taskId/assignees
 * @desc    Assign or update task assignees
 * @access  Private (Project members only)
 */
router.put('/:taskId/assignees', taskController.updateAssignees);

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete a task
 * @access  Private (Project members only)
 */
router.delete('/:taskId', taskController.deleteTask);

module.exports = router;
