const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send("Doctor Tracker API is running");
});



const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const AUTH_URL = process.env.BETTER_AUTH_URL;

const JWKS = createRemoteJWKSet(
  new URL(`${AUTH_URL}/api/auth/jwks`)
);

// Verify JWT middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization header
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized. Token is required.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify JWT
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    // Store user information
    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};

// Protect all API routes
app.use("/api", verifyToken);

// Helper Functions
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, parseInt(query.limit) || 10);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getSearchFilter = (search, fields) => {
  if (!search || typeof search !== 'string') return {};
  const regex = new RegExp(search.trim(), 'i');
  return {
    $or: fields.map((field) => ({ [field]: regex })),
  };
};

const sendServerError = (res, error) => {
  console.error("Server Error:", error);
  res.status(500).json({ message: error.message || "Internal Server Error" });
};

const isValidId = (id) => ObjectId.isValid(id);

let doctorsCollection;
let patientsCollection;

const run = async () => {
  try {
    await client.connect();
    const db = client.db('doctor_tracker_db');
    doctorsCollection = db.collection('doctors');
    patientsCollection = db.collection('patients');

    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
};
run();

// DOCTOR APIs

// GET all doctors with search, filter & pagination
app.get("/api/doctors", async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, status } = req.query;

    const filter = {
      ...getSearchFilter(search, [
        "name",
        "email",
        "specialization",
        "phone",
      ]),
    };

    if (status) filter.status = status;

    const [doctors, total] = await Promise.all([
      doctorsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      doctorsCollection.countDocuments(filter),
    ]);

    res.json({
      items: doctors,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    sendServerError(res, error);
  }
});

// CREATE doctor
app.post("/api/doctors", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      specialization,
      qualification,
      experience,
      consultationFee,
      address,
    } = req.body;

    if (!name || !email || !phone || !specialization) {
      return res.status(400).json({
        message: "Name, email, phone and specialization are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingDoctor = await doctorsCollection.findOne({
      email: normalizedEmail,
    });

    if (existingDoctor) {
      return res.status(409).json({
        message: "A doctor with this email already exists.",
      });
    }

    const newDoctor = {
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      specialization: specialization.trim(),
      qualification: qualification || "",
      experience: Number(experience) || 0,
      consultationFee: Number(consultationFee) || 0,
      address: address || "",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await doctorsCollection.insertOne(newDoctor);

    res.status(201).json({
      message: "Doctor created successfully.",
      doctor: {
        ...newDoctor,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    sendServerError(res, error);
  }
});

// GET doctor details with patients
app.get("/api/doctors/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid doctor ID." });
    }

    const doctor = await doctorsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found." });
    }

    const patients = await patientsCollection
      .find({ doctorId: doctor._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      doctor,
      patients,
    });
  } catch (error) {
    sendServerError(res, error);
  }
});

// UPDATE doctor
// PATCH /api/doctors/:id
app.patch("/api/doctors/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid doctor ID." });
    }

    const doctorId = new ObjectId(id);

    const allowedFields = [
      "name",
      "email",
      "phone",
      "specialization",
      "qualification",
      "experience",
      "consultationFee",
      "address",
      "status",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    if (updates.email) {
      updates.email = updates.email.trim().toLowerCase();

      const existingDoctor = await doctorsCollection.findOne({
        email: updates.email,
        _id: { $ne: doctorId },
      });

      if (existingDoctor) {
        return res.status(409).json({
          message: "Another doctor already uses this email.",
        });
      }
    }

    if (updates.name) updates.name = updates.name.trim();
    if (updates.phone) updates.phone = updates.phone.trim();

    if (updates.experience !== undefined) {
      updates.experience = Number(updates.experience) || 0;
    }

    if (updates.consultationFee !== undefined) {
      updates.consultationFee = Number(updates.consultationFee) || 0;
    }

    updates.updatedAt = new Date();

    const result = await doctorsCollection.findOneAndUpdate(
      { _id: doctorId },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ message: "Doctor not found." });
    }

    // Keep the stored doctor name in patient records up to date.
    if (updates.name) {
      await patientsCollection.updateMany(
        { doctorId },
        { $set: { doctorName: updates.name } }
      );
    }

    res.json({
      message: "Doctor updated successfully.",
      doctor: result,
    });
  });


// DELETE doctor
// DELETE /api/doctors/:id
app.delete("/api/doctors/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid doctor ID." });
    }

    const doctorId = new ObjectId(id);

    const result = await doctorsCollection.deleteOne({
      _id: doctorId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Doctor not found." });
    }

    // Keep patients, but remove their doctor assignment.
    await patientsCollection.updateMany(
      { doctorId },
      {
        $set: {
          doctorId: null,
          doctorName: null,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ message: "Doctor deleted successfully." });
  });


  // ========================================
// PATIENT APIs
// ========================================

// GET all patients
app.get("/api/patients",async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    let filter = {};

    if (req.query.search) {
      const searchFilter = getSearchFilter(req.query.search, ["name", "email", "phone"]);
      filter = { ...filter, ...searchFilter };
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.doctorId) {
      if (!isValidId(req.query.doctorId)) {
        return res.status(400).json({ message: "Invalid doctor ID." });
      }
      filter.doctorId = new ObjectId(req.query.doctorId);
    }

    const [items, total] = await Promise.all([
      patientsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      patientsCollection.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  });

// CREATE patient
// POST /api/patients
app.post("/api/patients", async (req, res) => {
    const {
      name,
      email,
      phone,
      age,
      gender,
      bloodGroup,
      address,
      doctorId,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        message: "Patient name and phone are required.",
      });
    }

    let assignedDoctorId = null;
    let doctorName = null;

    if (doctorId) {
      if (!isValidId(doctorId)) {
        return res.status(400).json({ message: "Invalid doctor ID." });
      }

      const doctor = await doctorsCollection.findOne({
        _id: new ObjectId(doctorId),
      });

      if (!doctor) {
        return res.status(404).json({ message: "Selected doctor not found." });
      }

      assignedDoctorId = doctor._id;
      doctorName = doctor.name;
    }

    const newPatient = {
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : "",
      phone: phone.trim(),
      age: Number(age) || null,
      gender: gender || "",
      bloodGroup: bloodGroup || "",
      address: address || "",
      doctorId: assignedDoctorId,
      doctorName,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await patientsCollection.insertOne(newPatient);

    res.status(201).json({
      message: "Patient created successfully.",
      patient: {
        ...newPatient,
        _id: result.insertedId,
      },
    });
  });

// GET patient details
// GET /api/patients/:id
app.get("/api/patients/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid patient ID." });
    }

    const patient = await patientsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    res.json({ patient });
  });

// UPDATE patient
// PATCH /api/patients/:id
app.patch("/api/patients/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid patient ID." });
    }

    const patientId = new ObjectId(id);

    const allowedFields = [
      "name",
      "email",
      "phone",
      "age",
      "gender",
      "bloodGroup",
      "address",
      "status",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    if (updates.name) updates.name = updates.name.trim();
    if (updates.phone) updates.phone = updates.phone.trim();
    if (updates.email !== undefined) {
      updates.email = updates.email.trim().toLowerCase();
    }
    if (updates.age !== undefined) {
      updates.age = Number(updates.age) || null;
    }

    updates.updatedAt = new Date();

    const result = await patientsCollection.findOneAndUpdate(
      { _id: patientId },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ message: "Patient not found." });
    }

    res.json({
      message: "Patient updated successfully.",
      patient: result,
    });
  });

// ASSIGN OR REMOVE doctor from a patient
// PATCH /api/patients/:id/doctor
// Body: { "doctorId": "doctor_mongodb_id" }
// To remove: { "doctorId": null }
app.patch("/api/patients/:id/doctor", async (req, res) => {
    const { id } = req.params;
    const { doctorId } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid patient ID." });
    }

    const patientId = new ObjectId(id);

    let assignedDoctorId = null;
    let doctorName = null;

    if (doctorId) {
      if (!isValidId(doctorId)) {
        return res.status(400).json({ message: "Invalid doctor ID." });
      }

      const doctor = await doctorsCollection.findOne({
        _id: new ObjectId(doctorId),
      });

      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found." });
      }

      assignedDoctorId = doctor._id;
      doctorName = doctor.name;
    }

    const result = await patientsCollection.findOneAndUpdate(
      { _id: patientId },
      {
        $set: {
          doctorId: assignedDoctorId,
          doctorName,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ message: "Patient not found." });
    }

    res.json({
      message: doctorId
        ? "Doctor assigned successfully."
        : "Doctor removed successfully.",
      patient: result,
    });
  });

// DELETE patient
// DELETE /api/patients/:id
app.delete("/api/patients/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid patient ID." });
    }

    const result = await patientsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Patient not found." });
    }

    res.json({ message: "Patient deleted successfully." });
  });


  // ========================================
// DASHBOARD APIs
// ========================================

// GET dashboard statistics
// GET /api/dashboard/stats
app.get("/api/dashboard/stats", async (req, res) => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalDoctors, totalPatients, newPatients, activePatients] =
      await Promise.all([
        doctorsCollection.countDocuments(),
        patientsCollection.countDocuments(),
        patientsCollection.countDocuments({
          createdAt: { $gte: startOfMonth },
        }),
        patientsCollection.countDocuments({ status: "active" }),
      ]);

    res.json({
      totalDoctors,
      totalPatients,
      newPatients,
      activePatients,
    });
  });

// GET monthly patient statistics (last 6 months)
// GET /api/dashboard/monthly-patients
app.get("/api/dashboard/monthly-patients", async (req, res) => {
    const now = new Date();
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
    );

    const results = await patientsCollection
      .aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            patients: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const monthlyData = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
      );

      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;

      const found = results.find(
        (item) => item._id.year === year && item._id.month === month
      );

      monthlyData.push({
        month: date.toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        patients: found ? found.patients : 0,
      });
    }

    res.json(monthlyData);
  });

// GET patient count per doctor
// GET /api/dashboard/patients-per-doctor
app.get("/api/dashboard/patients-per-doctor", async (req, res) => {
    const results = await doctorsCollection
      .aggregate([
        {
          $lookup: {
            from: "patients",
            localField: "_id",
            foreignField: "doctorId",
            as: "patients",
          },
        },
        {
          $project: {
            _id: 0,
            doctorName: "$name",
            totalPatients: { $size: "$patients" },
          },
        },
        { $sort: { totalPatients: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    res.json(results);
  });

// ========================================
// ERROR HANDLING
// ========================================

// Unknown API route
app.use((req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

// General error handler
app.use((error, req, res, next) => {
  console.error("API Error:", error);

  res.status(500).json({
    message: "Internal server error.",
  });
});



app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
