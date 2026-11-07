// const express = require('express');
// const app = express();
// const cors = require('cors');
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion } = require('mongodb');

// dotenv.config();

// const port = process.env.PORT || 5000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// const uri = process.env.MONGODB_URI;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   }
// });




// const run = async () => {
//   try {
//     await client.connect();
  

//   await client.db("admin").command({ ping: 1 });
//   console.log("Pinged your deployment. You successfully connected to MongoDB!");
// } finally {
//   //await client.close();
// }
// }
// run().catch(console.dir);


// const db = client.db('doctor_tracker_db');
// const doctorsCollection = db.collection('doctors');


// // DOCTOR APIs

// // GET all doctors
// // GET /api/doctors?page=1&limit=10&search=sarah&status=active

// app.get("/api/doctors", async (req, res) => {
//   try {
//     const { page, limit, skip } = getPagination(req.query);
//     const { search, status } = req.query;

//     const filter = {
//       ...getSearchFilter(search, [
//         "name",
//         "email",
//         "specialization",
//         "phone",
//       ]),
//     };

//     if (status) filter.status = status;

//     const [doctors, total] = await Promise.all([
//       doctorsCollection
//         .find(filter)
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .toArray(),

//       doctorsCollection.countDocuments(filter),
//     ]);

//     res.json({
//       items: doctors,
//       total,
//       currentPage: page,
//       totalPages: Math.ceil(total / limit),
//     });
//   } catch (error) {
//     sendServerError(res, error);
//   }
// });


// // CREATE doctor
// // POST /api/doctors
// app.post("/api/doctors", async (req, res) => {
//     const {
//       name,
//       email,
//       phone,
//       specialization,
//       qualification,
//       experience,
//       consultationFee,
//       address,
//     } = req.body;

//     if (!name || !email || !phone || !specialization) {
//       return res.status(400).json({
//         message: "Name, email, phone and specialization are required.",
//       });
//     }

//     const normalizedEmail = email.trim().toLowerCase();

//     const existingDoctor = await doctorsCollection.findOne({
//       email: normalizedEmail,
//     });

//     if (existingDoctor) {
//       return res.status(409).json({
//         message: "A doctor with this email already exists.",
//       });
//     }

//     const newDoctor = {
//       name: name.trim(),
//       email: normalizedEmail,
//       phone: phone.trim(),
//       specialization: specialization.trim(),
//       qualification: qualification || "",
//       experience: Number(experience) || 0,
//       consultationFee: Number(consultationFee) || 0,
//       address: address || "",
//       status: "active",
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     };

//     const result = await doctorsCollection.insertOne(newDoctor);

//     res.status(201).json({
//       message: "Doctor created successfully.",
//       doctor: {
//         ...newDoctor,
//         _id: result.insertedId,
//       },
//     });
//   });

//   // GET doctor details with patients
// // GET /api/doctors/:id

// app.get("/api/doctors/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidId(id)) {
//       return res.status(400).json({ message: "Invalid doctor ID." });
//     }

//     const doctor = await doctorsCollection.findOne({
//       _id: new ObjectId(id),
//     });

//     if (!doctor) {
//       return res.status(404).json({ message: "Doctor not found." });
//     }

//     const patients = await patientsCollection
//       .find({ doctorId: doctor._id })
//       .sort({ createdAt: -1 })
//       .toArray();

//     res.json({
//       doctor,
//       patients,
//     });
//   } catch (error) {
//     sendServerError(res, error);
//   }
// });




// app.get('/', (req, res) => {
//   res.send('Database connection is successful!');
// });

// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// });


const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

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


app.get('/', (req, res) => {
  res.send('Database connection is successful!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
