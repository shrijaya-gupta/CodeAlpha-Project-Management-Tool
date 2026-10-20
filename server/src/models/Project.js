const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters long'],
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project owner reference is required'],
      index: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: {
        values: ['active', 'completed', 'archived'],
        message: 'Status must be active, completed, or archived',
      },
      default: 'active',
      index: true,
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

// Compound index for member lookups and listing queries
projectSchema.index({ members: 1, createdAt: -1 });
projectSchema.index({ owner: 1, createdAt: -1 });

/**
 * Pre-save hook:
 * Ensures the project owner is automatically included in members
 * and prevents duplicate member ObjectIds in the array
 */
projectSchema.pre('save', async function () {
  if (this.owner) {
    const ownerIdStr = this.owner.toString();
    const existingMemberIds = this.members.map((m) => m.toString());

    if (!existingMemberIds.includes(ownerIdStr)) {
      this.members.unshift(this.owner);
    }
  }

  // Deduplicate members array while preserving ObjectId types
  const uniqueMemberStrings = Array.from(new Set(this.members.map((m) => m.toString())));
  this.members = uniqueMemberStrings.map((id) => new mongoose.Types.ObjectId(id));
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
