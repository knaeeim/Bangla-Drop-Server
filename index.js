const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");
const PORT = process.env.PORT || 5000;

// Middleware setup
app.use(cors());
app.use(express.json());
dotenv.config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.plgxbak.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db("banglaDrop");
        const parcelCollection = db.collection("parcels");

        app.get("/parcels", async (req, res) => {
            try {
                const result = await parcelCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.log(error);
            }
        });

        app.get("/parcels", async (req, res) => {
            try {
                const userEmail = req.query.email;

                const query = userEmail ? { createdBy: userEmail } : {};

                const option = {
                    sort: { createdAt: -1 },
                };

                const result = await parcelCollection
                    .find(query, option)
                    .toArray();
                res.send(result);

            } catch (error) {
                console.error('Error fetching parcels:', error);
                res.status(500).send({ message: 'Failed to get parcels' });
            }
        });

        // post parcel data to database
        app.post("/parcels", async (req, res) => {
            try {
                const parcels = req.body;
                const result = await parcelCollection.insertOne(parcels);
                res.send(result);
            } catch (error) {
                console.error("Error inserting parcel:", error);
                res.status(500).send("Internal Server Error");
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!"
        );
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Welcome to the API");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
