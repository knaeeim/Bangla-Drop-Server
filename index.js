const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const PORT = process.env.PORT || 3000;
const admin = require("firebase-admin");

// Middleware setup
app.use(cors());
app.use(express.json());
dotenv.config();
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);

const serviceAccount = require("./firebase-service-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

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
        const userCollection = db.collection("users");
        const parcelCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");
        const riderCollection = db.collection("riders");

        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res
                    .status(401)
                    .send({
                        message: "Oh My Dear Manger Nati Token Niya Asho!!",
                    });
            }
            const token = authHeader.split(" ")[1];
            if (!token) {
                return res
                    .status(401)
                    .send({
                        message: "Oh My Dear Manger Nati Token Niya Asho!!",
                    });
            }
            // Verify the token
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next();
            } catch (error) {
                return res.status(403).send({ message: "Invalid Token" });
            }
        };

        app.post("/users", async (req, res) => {
            const email = req.body.email;
            const existingUser = await userCollection.findOne({ email });
            if (existingUser) {
                // last login information update
                const lastLogin = req.body.last_login;
                const updateDoc = {
                    $set: {
                        last_login: lastLogin,
                    },
                };
                const result = await userCollection.updateOne(
                    { email },
                    updateDoc
                );
                return res
                    .status(200)
                    .send({ message: "User Already Exists", inserted: false });
            }

            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.get("/parcels", verifyFBToken, async (req, res) => {
            try {
                const userEmail = req.query.email;

                const query = userEmail ? { created_by: userEmail } : {};

                const option = {
                    sort: { createdAt: -1 },
                };

                const result = await parcelCollection
                    .find(query, option)
                    .toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching parcels:", error);
                res.status(500).send({ message: "Failed to get parcels" });
            }
        });

        // get a single parcel by id
        app.get("/parcel/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await parcelCollection.findOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to get parcel" });
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

        app.post("/create-payment-intent", async (req, res) => {
            console.log("Received request to create payment intent");
            const amountInCents = req.body.amountInCents;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.json({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                res.status(500).send({
                    message: "Failed to create payment intent",
                });
            }
        });

        app.get("/payments", async (req, res) => {
            try {
                const userEmail = req.query.email;
                const query = userEmail ? { email: userEmail } : {};
                const result = await paymentCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching payments:", error);
                res.status(500).send({ message: "Failed to get payments" });
            }
        });

        app.post("/payments", async (req, res) => {
            try {
                const {
                    parcelId,
                    transactionId,
                    amount,
                    email,
                    paymentMethod,
                } = req.body;

                // 1. Update the parcel payment status
                const updateParcel = await parcelCollection.updateOne(
                    { _id: new ObjectId(parcelId) },
                    { $set: { payment_status: "Paid" } }
                );

                if (updateParcel.modifiedCount === 0) {
                    return res
                        .status(404)
                        .send({ message: "Parcel not found or already paid" });
                }

                const paymentDoc = {
                    parcelId,
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    paid_at_string: new Date().toISOString(),
                    paid_at: new Date(),
                };

                const paymentResult = await paymentCollection.insertOne(
                    paymentDoc
                );

                res.status(201).send({
                    message: "Payment recorded and parcel updated successfully",
                    insertedId: paymentResult.insertedId,
                });
            } catch (error) {
                console.error("Error processing payment:", error);
                res.status(500).send({ message: "Failed to process payment" });
            }
        });

        // Rider related APIs
        app.post("/riders", async(req, res) => {
            try {
                const riderData = req.body;
                const result = await riderCollection.insertOne(riderData);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({
                    message: "Failed to add rider",
                    error: error.message,
                });
            }
        })

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
