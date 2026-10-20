import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const schema = new mongoose.Schema(
  {},
  {
    strict: false,
    timestamps: true,
  }
);

const models = {};

function modelFor(resource) {
  if (!models[resource]) {
    models[resource] =
      mongoose.models[resource] ||
      mongoose.model(resource, schema, resource.toLowerCase());
  }

  return models[resource];
}

const allowed = {
  products: "Product",
  workers: "Worker",
  attendance: "Attendance",
  bills: "Bill",
  expenses: "Expense",
  suppliers: "Supplier",
};

const clean = (value) => String(value ?? "").trim();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ClothShop Inventory API",
  });
});

// GET, CREATE, UPDATE AND DELETE ROUTES
for (const [route, modelName] of Object.entries(allowed)) {
  const Model = modelFor(modelName);

  app.get(`/api/${route}`, async (req, res) => {
    try {
      const q = clean(req.query.q);
      let filter = {};

      if (q) {
        const fields =
          route === "products"
            ? ["name", "sku", "category", "size", "color"]
            : route === "workers"
              ? ["name", "phone", "role"]
              : route === "attendance"
                ? ["workerName", "status", "date"]
                : route === "bills"
                  ? ["invoiceNo", "customerName", "paymentMethod"]
                  : route === "suppliers"
                    ? ["name", "phone", "company"]
                    : ["title", "category", "date"];

        filter = {
          $or: fields.map((field) => ({
            [field]: {
              $regex: q,
              $options: "i",
            },
          })),
        };
      }

      const rows = await Model.find(filter)
        .sort({ createdAt: -1 })
        .limit(1000);

      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get(`/api/${route}/:id`, async (req, res) => {
    try {
      const row = await Model.findById(req.params.id);

      if (!row) {
        return res.status(404).json({
          message: "Record not found",
        });
      }

      res.json(row);
    } catch {
      res.status(400).json({
        message: "Invalid record id",
      });
    }
  });

  app.post(`/api/${route}`, async (req, res) => {
    try {
      const data = { ...req.body };

      if (route === "products") {
        data.quantity = Number(data.quantity || 0);
        data.price = Number(data.price || 0);
      }

      if (route === "workers") {
        data.dailySalary = Number(data.dailySalary || 0);
      }

      if (route === "expenses") {
        data.amount = Number(data.amount || 0);
      }

      const row = await Model.create(data);

      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put(`/api/${route}/:id`, async (req, res) => {
    try {
      const row = await Model.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!row) {
        return res.status(404).json({
          message: "Record not found",
        });
      }

      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete(`/api/${route}/:id`, async (req, res) => {
    try {
      const row = await Model.findByIdAndDelete(req.params.id);

      if (!row) {
        return res.status(404).json({
          message: "Record not found",
        });
      }

      res.json({ message: "Deleted" });
    } catch {
      res.status(400).json({
        message: "Invalid record id",
      });
    }
  });
}

// CREATE BILL WITH EDITABLE SELLING PRICE
app.post("/api/bills/create", async (req, res) => {
  const {
    customerName = "",
    customerPhone = "",
    paymentMethod = "Cash",
    items = [],
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Add at least one item",
    });
  }

  const normalized = [];
  const stockChanges = [];
  let total = 0;

  try {
    // Validate all products and prices before changing stock.
    for (const item of items) {
      const product = await modelFor("Product").findById(
        item.productId
      );

      if (!product) {
        throw new Error("A selected product was not found");
      }

      const quantity = Number(item.quantity || 0);

      const originalPrice = Number(
        item.originalPrice ?? product.price ?? 0
      );

      // This is the actual price charged to the customer.
      const price = Number(item.price ?? product.price ?? 0);

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Invalid quantity for ${product.name}`);
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid selling price for ${product.name}`);
      }

      if (
        !Number.isFinite(originalPrice) ||
        originalPrice < 0
      ) {
        throw new Error(`Invalid original price for ${product.name}`);
      }

      if (Number(product.quantity || 0) < quantity) {
        throw new Error(
          `Insufficient stock for ${product.name}`
        );
      }

      const discountPerItem = Math.max(
        0,
        originalPrice - price
      );

      const lineTotal = quantity * price;

      normalized.push({
        productId: product._id,
        name: product.name,
        sku: product.sku || "",
        quantity,
        originalPrice,
        price,
        discountPerItem,
        lineTotal,
      });

      total += lineTotal;
    }

    // Reduce stock only if enough pieces are still available.
    for (const item of normalized) {
      const updatedProduct =
        await modelFor("Product").findOneAndUpdate(
          {
            _id: item.productId,
            quantity: { $gte: item.quantity },
          },
          {
            $inc: { quantity: -item.quantity },
          },
          { new: true }
        );

      if (!updatedProduct) {
        throw new Error(
          `Insufficient stock for ${item.name}`
        );
      }

      stockChanges.push(item);
    }

    const invoiceNo = `INV-${Date.now()}`;

    const bill = await modelFor("Bill").create({
      invoiceNo,
      customerName,
      customerPhone,
      paymentMethod,
      items: normalized,
      total,
      billDate: new Date(),
    });

    return res.status(201).json(bill);
  } catch (error) {
    // Restore stock if saving the invoice fails.
    for (const item of stockChanges) {
      try {
        await modelFor("Product").updateOne(
          { _id: item.productId },
          { $inc: { quantity: item.quantity } }
        );
      } catch (rollbackError) {
        console.error(
          "Stock rollback failed:",
          rollbackError.message
        );
      }
    }

    return res.status(400).json({
      message: error.message,
    });
  }
});

// DASHBOARD SUMMARY
app.get("/api/dashboard", async (_req, res) => {
  try {
    const [
      products,
      workers,
      bills,
      expenses,
      lowStock,
    ] = await Promise.all([
      modelFor("Product").find(),
      modelFor("Worker").find(),
      modelFor("Bill").find(),
      modelFor("Expense").find(),
      modelFor("Product").find({
        quantity: { $lte: 5 },
      }),
    ]);

    const revenue = bills.reduce(
      (sum, bill) => sum + Number(bill.total || 0),
      0
    );

    const expenseTotal = expenses.reduce(
      (sum, expense) =>
        sum + Number(expense.amount || 0),
      0
    );

    res.json({
      productCount: products.length,
      workerCount: workers.length,
      billCount: bills.length,
      revenue,
      expenseTotal,
      lowStock,
      recentBills: bills.slice(0, 5),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// WORKER MONTHLY SALARY
app.get("/api/workers/:id/salary", async (req, res) => {
  try {
    const worker = await modelFor("Worker").findById(
      req.params.id
    );

    if (!worker) {
      return res.status(404).json({
        message: "Worker not found",
      });
    }

    const month = String(
      req.query.month ||
      new Date().toISOString().slice(0, 7)
    );

    const records = await modelFor("Attendance").find({
      workerId: String(worker._id),
      date: { $regex: `^${month}` },
    });

    const payableRecords = records.filter((record) =>
      ["Present", "Half Day"].includes(record.status)
    );

    const payableDays = payableRecords.reduce(
      (sum, record) =>
        sum + (record.status === "Half Day" ? 0.5 : 1),
      0
    );

    const dailySalary = Number(worker.dailySalary || 0);

    res.json({
      workerName: worker.name,
      month,
      payableDays,
      dailySalary,
      salary: payableDays * dailySalary,
      records,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
});

// CONNECT TO MONGODB AND START SERVER
const PORT = process.env.PORT || 5000;

mongoose
  .connect(
    process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/clothshop_inventory"
  )
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  });
