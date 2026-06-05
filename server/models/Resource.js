import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    index: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  }
});

export const Resource = mongoose.model('Resource', resourceSchema);
