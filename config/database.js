import mongoose from "mongoose";

// Fail database calls after 5 s instead of 10 s while the database is unreachable,
// so players get an error message quickly instead of waiting.
mongoose.set("bufferTimeoutMS", 5000);

export async function connectDB() {
    // MONGO_URI is accepted too (the name used in the original .env)
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.warn("⚠️ MONGODB_URI is not set - using a local database. On Railway, add it under Variables.");
    }

    mongoose.connection.on("disconnected", () => console.warn("⚠️ MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

    try {
        await mongoose.connect(uri || "mongodb://127.0.0.1:27017/propocalypse", {
            serverSelectionTimeoutMS: 10000
        });

        console.log("✅ MongoDB Connected");
    }
    catch (err) {
        console.error("❌ MongoDB connection failed:", err.message);
    }
}
