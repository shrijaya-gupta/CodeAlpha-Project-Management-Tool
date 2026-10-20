const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      minlength: [1, 'Task title cannot be empty'],
      maxlength: [150, 'Task title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Task description cannot exceed 5000 characters'],
      default: '',
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Parent project reference is required'],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task creator reference is required'],
      index: true,
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: {
        values: ['todo', 'in_progress', 'done'],
        message: 'Status must be todo, in_progress, or done',
      },
      default: 'todo',
      index: true,
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be low, medium, high, or urgent',
      },
      default: 'medium',
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes tailored for project task queries and filtering
taskSchema.index({ project: 1, createdAt: -1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, priority: 1 });
taskSchema.index({ project: 1, dueDate: 1 });
taskSchema.index({ assignees: 1 });

/**
 * Pre-save hook:
 * Automatically deduplicates the assignees array
 */
taskSchema.pre('save', async function () {
  if (this.assignees && this.assignees.length > 0) {
    const uniqueIds = Array.from(new Set(this.assignees.map((id) => id.toString())));
    this.assignees = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
  }
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
