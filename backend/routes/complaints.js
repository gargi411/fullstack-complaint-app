const express = require('express');
const router = express.Router();
const multer = require('multer');
const Complaint = require('../models/Complaint');
const auth = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage });

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const body = req.body;
    const id = 'CMP' + Date.now();
    const imageName = req.file ? req.file.filename : null;
    const imageUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : null;
    const mapPin = body.mapPin === 'true' || body.mapPin === true;
    const mapCoordinates = body.mapCoordinates ? JSON.parse(body.mapCoordinates) : null;

    const complaint = new Complaint({
      id,
      fullName: body.fullName,
      contactNumber: body.contactNumber,
      email: body.email,
      routeNumber: body.routeNumber,
      location: body.location,
      complaintType: body.complaintType,
      description: body.description,
      priority: body.priority,
      imageName,
      imageUrl,
      mapPin,
      mapCoordinates,
      timestamp: body.timestamp || new Date().toLocaleString('en-IN'),
      status: 'Pending'
    });

    await complaint.save();
    res.status(201).json({ success: true, complaint });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json({ success: true, complaints });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

module.exports = router;
