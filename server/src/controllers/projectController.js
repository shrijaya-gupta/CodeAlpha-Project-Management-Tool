const Project = require('../models/Project');
const User = require('../models/User');
const { isValidObjectId, escapeRegex } = require('../utils/validation');

/**
 * @desc    Create a new project
 * @route   POST /api/projects
 * @access  Private (Authenticated user)
 */
const createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Project name is required and must be at least 2 characters long.',
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Project name cannot exceed 100 characters.',
      });
    }

    if (description && typeof description === 'string' && description.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Description cannot exceed 500 characters.',
      });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      owner: req.user._id,
      members: [req.user._id],
      status: 'active',
    });

    const populatedProject = await Project.findById(project._id)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: populatedProject,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List all projects accessible to the authenticated user (owner or member)
 * @route   GET /api/projects
 * @access  Private (Authenticated user)
 */
const getProjects = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;

    // Base query: Authenticated user must be either owner OR a member
    const query = {
      $or: [{ owner: req.user._id }, { members: req.user._id }],
    };

    // Filter by status if provided
    if (status) {
      const allowedStatuses = ['active', 'completed', 'archived'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status filter. Allowed values: ${allowedStatuses.join(', ')}`,
        });
      }
      query.status = status;
    }

    // Search by project name if provided
    if (search && typeof search === 'string' && search.trim() !== '') {
      const sanitizedSearch = escapeRegex(search.trim());
      query.name = { $regex: sanitizedSearch, $options: 'i' };
    }

    // Parse and sanitize pagination parameters
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (parsedPage - 1) * parsedLimit;

    // Execute queries in parallel for efficiency
    const [total, projects] = await Promise.all([
      Project.countDocuments(query),
      Project.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('owner', 'name email')
        .populate('members', 'name email'),
    ]);

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    return res.status(200).json({
      success: true,
      count: projects.length,
      total,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
      projects,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single project details by ID
 * @route   GET /api/projects/:projectId
 * @access  Private (Owner or Member)
 */
const getProjectById = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format.',
      });
    }

    const project = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Authorization: User must be owner or member
    const currentUserId = req.user._id.toString();
    const isOwner = project.owner._id.toString() === currentUserId;
    const isMember = project.members.some((m) => m._id.toString() === currentUserId);

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this project.',
      });
    }

    return res.status(200).json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update project information
 * @route   PATCH /api/projects/:projectId
 * @access  Private (Owner only)
 */
const updateProject = async (req, res, next) => {
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

    // Authorization: Only project owner can update details
    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the project owner can update this project.',
      });
    }

    // Reject empty updates
    const incomingFields = Object.keys(req.body);
    if (incomingFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one field to update.',
      });
    }

    // Prevent mass assignment: strictly allow name, description, status
    const allowedFields = ['name', 'description', 'status'];
    const invalidFields = incomingFields.filter((field) => !allowedFields.includes(field));

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid fields: ${invalidFields.join(', ')}. Only name, description, and status can be updated.`,
      });
    }

    const { name, description, status } = req.body;

    // Validate fields if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Project name must be at least 2 characters long.',
        });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Project name cannot exceed 100 characters.',
        });
      }
      project.name = name.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string.',
        });
      }
      if (description.trim().length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot exceed 500 characters.',
        });
      }
      project.description = description.trim();
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'completed', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }
      project.status = status;
    }

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      project: updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add a team member to a project by user email
 * @route   POST /api/projects/:projectId/members
 * @access  Private (Owner only)
 */
const addMember = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email } = req.body;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format.',
      });
    }

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Member email is required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Authorization: Only project owner can add members
    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the project owner can add team members.',
      });
    }

    // Find the user by normalized email
    const normalizedEmail = email.toLowerCase().trim();
    const userToAdd = await User.findOne({ email: normalizedEmail });

    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User with this email was not found. The user must register for a TaskFlow account first.',
      });
    }

    const targetUserIdStr = userToAdd._id.toString();

    // Prevent adding the owner as a duplicate member
    if (targetUserIdStr === project.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: 'The project owner is already a member of this project.',
      });
    }

    // Prevent duplicate membership
    const isAlreadyMember = project.members.some((m) => m.toString() === targetUserIdStr);
    if (isAlreadyMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this project.',
      });
    }

    project.members.push(userToAdd._id);
    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Team member added successfully',
      members: updatedProject.members,
      project: updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a team member from a project
 * @route   DELETE /api/projects/:projectId/members/:userId
 * @access  Private (Owner only)
 */
const removeMember = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project ID format.',
      });
    }

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Authorization: Only the project owner can remove team members
    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the project owner can remove team members.',
      });
    }

    // Prevent removing the project owner
    if (userId === project.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: 'The project owner cannot be removed from project members.',
      });
    }

    // Check if the user is actually a member
    const memberIndex = project.members.findIndex((m) => m.toString() === userId);
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this project.',
      });
    }

    // Remove member
    project.members.splice(memberIndex, 1);
    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Team member removed successfully',
      members: updatedProject.members,
      project: updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a project
 * @route   DELETE /api/projects/:projectId
 * @access  Private (Owner only)
 */
const deleteProject = async (req, res, next) => {
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

    // Authorization: Only the project owner can delete the project
    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the project owner can delete this project.',
      });
    }

    await Project.findByIdAndDelete(projectId);

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  addMember,
  removeMember,
  deleteProject,
};
