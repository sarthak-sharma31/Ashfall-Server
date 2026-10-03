import mongoose from "mongoose";

export async function connectDB() {
    try {
        // Set MONGODB_URI on the host (e.g. Railway / MongoDB Atlas); falls back to a local database
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/propocalypse");

        console.log("✅ MongoDB Connected");
    }
    catch (err) {
        console.log(err);
    }
}
