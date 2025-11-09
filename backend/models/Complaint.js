const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  fullName: String,
  contactNumber: String,
  email: String,
  routeNumber: String,
  location: String,
  complaintType: String,
  description: String,
  priority: String,
  imageName: String,
  imageUrl: String,
  mapPin: { type: Boolean, default: false },
  mapCoordinates: { x: Number, y: Number },
  timestamp: String,
  status: { type: String, default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('Complaint', ComplaintSchema);
