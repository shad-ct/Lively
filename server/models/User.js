import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: true,
  },
  picture: {
    type: String,
  },
  needsProfileSetup: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['host', 'attendee'],
    default: 'attendee',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export const User = mongoose.model('User', userSchema);
