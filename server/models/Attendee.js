import mongoose from 'mongoose';

const attendeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  leftAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  score: {
    type: Number,
    default: 0,
  },
  correctAnswersCount: {
    type: Number,
    default: 0,
  }
});

export const Attendee = mongoose.model('Attendee', attendeeSchema);
