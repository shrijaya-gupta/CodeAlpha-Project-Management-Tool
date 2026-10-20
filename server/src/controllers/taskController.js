const Task = require('../models/Task');
const Project = require('../models/Project');
const { isValidObjectId, escapeRegex, isValidDate } = require('../utils/validation');

/**
 * Helper to check whether a user is an owner or member of a project
 * @param {object} project - Mongoose Project document
 * @param {string|mongoose.Types.ObjectId} userId - User ID
 * @returns {boolean} True if owner or member, false otherwise
 */
const isUserProjectMember = (project, userId) => {
  if (!project || !userId) return false;
  const userIdStr = userId.toString();
  const ownerStr = (project.owner._id || project.owner).toString();
  if (ownerStr === userIdStr) return true;

  if (Array.isArray(project.members)) {
    return project.members.some((m) => (m._id || m).toString() === userIdStr);
  }
  return false;
};

/**
 * @desc    Create a new task inside a project
 * @route   POST /api/projects/:projectId/tasks
 * @access  Private (Project members only)
 */
const createTask = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format.',
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Verify membership
    if (!isUserProjectMember(project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    const { title, description, priority, status, dueDate, assignees } = req.body;

    // Validate title
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Task title is required.',
      });
    }
    if (title.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Task title cannot exceed 150 characters.',
      });
    }

    // Validate description
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Task description must be a string.',
        });
      }
      if (description.trim().length > 5000) {
        return res.status(400).json({
          success: false,
          message: 'Task description cannot exceed 5000 characters.',
        });
      }
    }

    // Validate status
    const validStatuses = ['todo', 'in_progress', 'done'];
    const taskStatus = status ? status.toLowerCase().trim() : 'todo';
    if (!validStatuses.includes(taskStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    const taskPriority = priority ? priority.toLowerCase().trim() : 'medium';
    if (!validPriorities.includes(taskPriority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
      });
    }

    // Validate dueDate
    let parsedDueDate = null;
    if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
      if (!isValidDate(dueDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dueDate format. Please provide a valid date.',
        });
      }
      parsedDueDate = new Date(dueDate);
    }

    // Validate assignees
    let validatedAssignees = [];
    if (assignees !== undefined && assignees !== null) {
      if (!Array.isArray(assignees)) {
        return res.status(400).json({
          success: false,
          message: 'Assignees must be an array of user IDs.',
        });
      }

      // Check format
      for (const assigneeId of assignees) {
        if (!isValidObjectId(assigneeId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid assignee ID format: ${assigneeId}`,
          });
        }
      }

      // Check duplicates
      const uniqueIds = Array.from(new Set(assignees));
      if (uniqueIds.length !== assignees.length) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate assignees are not permitted.',
        });
      }

      // Verify every assignee belongs to the project
      const projectMemberIds = project.members.map((m) => m.toString());
      for (const assigneeId of assignees) {
        if (!projectMemberIds.includes(assigneeId)) {
          return res.status(400).json({
            success: false,
            message: `Assignee with ID ${assigneeId} is not a member of this project.`,
          });
        }
      }

      validatedAssignees = assignees;
    }

    // Create task
    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      project: project._id,
      createdBy: req.user._id,
      assignees: validatedAssignees,
      status: taskStatus,
      priority: taskPriority,
      dueDate: parsedDueDate,
    });

    const populatedTask = await Task.findById(task._id)
      .populate('createdBy', 'name email')
      .populate('assignees', 'name email');

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List tasks in a project with filtering, search, and pagination
 * @route   GET /api/projects/:projectId/tasks
 * @access  Private (Project members only)
 */
const getProjectTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format.',
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Verify membership
    if (!isUserProjectMember(project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    const {
      status,
      priority,
      assignee,
      search,
      dueBefore,
      dueAfter,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = { project: project._id };

    // Status filter
    if (status) {
      const validStatuses = ['todo', 'in_progress', 'done'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status filter. Allowed values: ${validStatuses.join(', ')}`,
        });
      }
      query.status = status;
    }

    // Priority filter
    if (priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: `Invalid priority filter. Allowed values: ${validPriorities.join(', ')}`,
        });
      }
      query.priority = priority;
    }

    // Assignee filter
    if (assignee) {
      if (!isValidObjectId(assignee)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assignee ID format.',
        });
      }
      query.assignees = assignee;
    }

    // Search query on title and description
    if (search && typeof search === 'string' && search.trim() !== '') {
      const sanitized = escapeRegex(search.trim());
      query.$or = [
        { title: { $regex: sanitized, $options: 'i' } },
        { description: { $regex: sanitized, $options: 'i' } },
      ];
    }

    // Due date filters
    if (dueBefore) {
      if (!isValidDate(dueBefore)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dueBefore date format.',
        });
      }
      query.dueDate = { ...(query.dueDate || {}), $lte: new Date(dueBefore) };
    }

    if (dueAfter) {
      if (!isValidDate(dueAfter)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dueAfter date format.',
        });
      }
      query.dueDate = { ...(query.dueDate || {}), $gte: new Date(dueAfter) };
    }

    // Sorting fields validation
    const allowedSortFields = ['createdAt', 'dueDate', 'priority', 'status', 'title'];
    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sortBy field. Allowed fields: ${allowedSortFields.join(', ')}`,
      });
    }

    const sortDirection = order.toString().toLowerCase() === 'asc' ? 1 : -1;
    // Deterministic sort with tie-breaker
    const sortObj = { [sortBy]: sortDirection, _id: 1 };

    // Pagination
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (parsedPage - 1) * parsedLimit;

    const [total, tasks] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parsedLimit)
        .populate('createdBy', 'name email')
        .populate('assignees', 'name email'),
    ]);

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    return res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
      tasks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single task details
 * @route   GET /api/tasks/:taskId
 * @access  Private (Project members only)
 */
const getTaskById = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!isValidObjectId(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format.',
      });
    }

    const task = await Task.findById(taskId)
      .populate('project', 'name owner members')
      .populate('createdBy', 'name email')
      .populate('assignees', 'name email');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Verify parent project membership
    if (!isUserProjectMember(task.project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    return res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update task details (title, description, priority, status, dueDate)
 * @route   PATCH /api/tasks/:taskId
 * @access  Private (Project members only)
 */
const updateTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!isValidObjectId(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format.',
      });
    }

    const task = await Task.findById(taskId).populate('project', 'name owner members');
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Verify parent project membership
    if (!isUserProjectMember(task.project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    const incomingFields = Object.keys(req.body);
    if (incomingFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one field to update.',
      });
    }

    // Whitelist update fields to prevent mass assignment
    const allowedFields = ['title', 'description', 'priority', 'status', 'dueDate'];
    const invalidFields = incomingFields.filter((f) => !allowedFields.includes(f));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid fields: ${invalidFields.join(', ')}. Only title, description, priority, status, and dueDate can be updated.`,
      });
    }

    const { title, description, priority, status, dueDate } = req.body;

    // Validate title if provided
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Task title cannot be empty.',
        });
      }
      if (title.trim().length > 150) {
        return res.status(400).json({
          success: false,
          message: 'Task title cannot exceed 150 characters.',
        });
      }
      task.title = title.trim();
    }

    // Validate description if provided
    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string.',
        });
      }
      if (description && description.trim().length > 5000) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot exceed 5000 characters.',
        });
      }
      task.description = description ? description.trim() : '';
    }

    // Validate priority if provided
    if (priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: `Priority must be one of: ${validPriorities.join(', ')}`,
        });
      }
      task.priority = priority;
    }

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ['todo', 'in_progress', 'done'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }
      task.status = status;
    }

    // Validate dueDate if provided
    if (dueDate !== undefined) {
      if (dueDate === null || dueDate === '') {
        task.dueDate = null;
      } else {
        if (!isValidDate(dueDate)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid dueDate format. Please provide a valid date.',
          });
        }
        task.dueDate = new Date(dueDate);
      }
    }

    await task.save();

    const updatedTask = await Task.findById(taskId)
      .populate('createdBy', 'name email')
      .populate('assignees', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign or update task assignees
 * @route   PUT /api/tasks/:taskId/assignees
 * @access  Private (Project members only)
 */
const updateAssignees = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!isValidObjectId(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format.',
      });
    }

    const task = await Task.findById(taskId).populate('project', 'name owner members');
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Verify parent project membership
    if (!isUserProjectMember(task.project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    const { assignees } = req.body;

    if (!assignees || !Array.isArray(assignees)) {
      return res.status(400).json({
        success: false,
        message: 'Assignees must be an array of user IDs.',
      });
    }

    // If empty array: unassign everyone
    if (assignees.length === 0) {
      task.assignees = [];
      await task.save();

      const updatedTask = await Task.findById(taskId)
        .populate('createdBy', 'name email')
        .populate('assignees', 'name email');

      return res.status(200).json({
        success: true,
        message: 'Task assignees updated successfully',
        assignees: updatedTask.assignees,
        task: updatedTask,
      });
    }

    // Validate each ID format
    for (const assigneeId of assignees) {
      if (!isValidObjectId(assigneeId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid assignee ID format: ${assigneeId}`,
        });
      }
    }

    // Check for duplicates
    const uniqueIds = Array.from(new Set(assignees));
    if (uniqueIds.length !== assignees.length) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate assignees are not permitted.',
      });
    }

    // Verify all assignees belong to the parent project
    const projectMemberIds = task.project.members.map((m) => m.toString());
    for (const assigneeId of assignees) {
      if (!projectMemberIds.includes(assigneeId)) {
        return res.status(400).json({
          success: false,
          message: `Assignee with ID ${assigneeId} is not a member of this project.`,
        });
      }
    }

    // Replace assignees completely
    task.assignees = assignees;
    await task.save();

    const updatedTask = await Task.findById(taskId)
      .populate('createdBy', 'name email')
      .populate('assignees', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Task assignees updated successfully',
      assignees: updatedTask.assignees,
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a task
 * @route   DELETE /api/tasks/:taskId
 * @access  Private (Project members only)
 */
const deleteTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!isValidObjectId(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format.',
      });
    }

    const task = await Task.findById(taskId).populate('project', 'name owner members');
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Verify parent project membership
    if (!isUserProjectMember(task.project, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    await Task.findByIdAndDelete(taskId);

    return res.status(200).json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTask,
  getProjectTasks,
  getTaskById,
  updateTask,
  updateAssignees,
  deleteTask,
};
