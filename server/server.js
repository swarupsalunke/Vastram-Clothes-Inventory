import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
const models = {};
function modelFor(resource) {
  if (!models[resource]) models[resource] = mongoose.models[resource] || mongoose.model(resource, schema, resource.toLowerCase());
  return models[resource];
}
const allowed = {
  products: "Product", workers: "Worker", attendance: "Attendance",
  bills: "Bill", expenses: "Expense", suppliers: "Supplier"
};
const clean = (v) => String(v ?? "").trim();

app.get("/api/health", (_req,res)=>res.json({ok:true, service:"ClothShop Inventory API"}));

for (const [route, modelName] of Object.entries(allowed)) {
  const Model = modelFor(modelName);
  app.get(`/api/${route}`, async (req,res) => {
    try {
      const q = clean(req.query.q);
      let filter = {};
      if (q) {
        const fields = route === "products" ? ["name","sku","category","size","color"] :
          route === "workers" ? ["name","phone","role"] :
          route === "attendance" ? ["workerName","status","date"] :
          route === "bills" ? ["invoiceNo","customerName","paymentMethod"] :
          route === "suppliers" ? ["name","phone","company"] : ["title","category","date"];
        filter = {$or: fields.map(k => ({[k]: {$regex:q, $options:"i"}}))};
      }
      const rows = await Model.find(filter).sort({createdAt:-1}).limit(1000);
      res.json(rows);
    } catch(e) { res.status(500).json({message:e.message}); }
  });
  app.get(`/api/${route}/:id`, async (req,res) => {
    try { const row=await Model.findById(req.params.id); if(!row) return res.status(404).json({message:"Record not found"}); res.json(row); }
    catch(e){res.status(400).json({message:"Invalid record id"});}
  });
  app.post(`/api/${route}`, async (req,res) => {
    try {
      const data = {...req.body};
      if (route === "products") {
        data.quantity = Number(data.quantity || 0); data.price = Number(data.price || 0);
      }
      if (route === "workers") data.dailySalary = Number(data.dailySalary || 0);
      if (route === "expenses") data.amount = Number(data.amount || 0);
      const row = await Model.create(data); res.status(201).json(row);
    } catch(e){res.status(400).json({message:e.message});}
  });
  app.put(`/api/${route}/:id`, async (req,res) => {
    try {
      const row=await Model.findByIdAndUpdate(req.params.id, {$set:req.body}, {new:true, runValidators:true});
      if(!row) return res.status(404).json({message:"Record not found"}); res.json(row);
    } catch(e){res.status(400).json({message:e.message});}
  });
  app.delete(`/api/${route}/:id`, async (req,res) => {
    try { const row=await Model.findByIdAndDelete(req.params.id); if(!row) return res.status(404).json({message:"Record not found"}); res.json({message:"Deleted"}); }
    catch(e){res.status(400).json({message:"Invalid record id"});}
  });
}

// Invoice creation is transactional at application level: validate stock, decrement, then save bill.
app.post("/api/bills/create", async (req,res) => {
  try {
    const {customerName="", customerPhone="", paymentMethod="Cash", items=[]} = req.body;
    if (!items.length) return res.status(400).json({message:"Add at least one item"});
    let total=0, normalized=[];
    for (const item of items) {
      const p=await modelFor("Product").findById(item.productId);
      if (!p) throw new Error("A selected product was not found");
      const qty=Number(item.quantity||0), price=Number(item.price ?? p.price ?? 0);
      if(qty<1) throw new Error("Quantity must be at least 1");
      if(Number(p.quantity||0)<qty) throw new Error(`Insufficient stock for ${p.name}`);
      normalized.push({productId:p._id, name:p.name, sku:p.sku||"", quantity:qty, price, lineTotal:qty*price});
      total += qty*price;
    }
    // Use conditional stock updates so this works with local standalone MongoDB too.
    for (const item of normalized) {
      const updated=await modelFor("Product").findOneAndUpdate(
        {_id:item.productId, quantity:{$gte:item.quantity}},
        {$inc:{quantity:-item.quantity}}, {new:true}
      );
      if(!updated) {
        // Restore earlier decrements if a later stock update could not be completed.
        for(const prior of normalized.slice(0, normalized.indexOf(item))) {
          await modelFor("Product").updateOne({_id:prior.productId}, {$inc:{quantity:prior.quantity}});
        }
        throw new Error(`Insufficient stock for ${item.name}`);
      }
    }
    const invoiceNo="INV-"+Date.now();
    const bill=await modelFor("Bill").create({invoiceNo, customerName, customerPhone, paymentMethod, items:normalized, total, billDate:new Date()});
    res.status(201).json(bill);
  } catch(e) { res.status(400).json({message:e.message}); }
});

app.get("/api/dashboard", async (_req,res)=>{
  try {
    const [products, workers, bills, expenses, lowStock] = await Promise.all([
      modelFor("Product").find(), modelFor("Worker").find(), modelFor("Bill").find(),
      modelFor("Expense").find(), modelFor("Product").find({quantity:{$lte:5}})
    ]);
    const revenue=bills.reduce((s,b)=>s+Number(b.total||0),0);
    const expenseTotal=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
    res.json({productCount:products.length, workerCount:workers.length, billCount:bills.length, revenue, expenseTotal, lowStock, recentBills:bills.slice(0,5)});
  } catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/workers/:id/salary", async (req,res)=>{
  try {
    const worker=await modelFor("Worker").findById(req.params.id);
    if(!worker) return res.status(404).json({message:"Worker not found"});
    const month=String(req.query.month||new Date().toISOString().slice(0,7));
    const rows=await modelFor("Attendance").find({workerId:String(worker._id), date:{$regex:`^${month}`}});
    const present=rows.filter(r=>["Present","Half Day"].includes(r.status));
    const payableDays=present.reduce((s,r)=>s+(r.status==="Half Day"?0.5:1),0);
    res.json({workerName:worker.name, month, payableDays, dailySalary:Number(worker.dailySalary||0), salary:payableDays*Number(worker.dailySalary||0), records:rows});
  } catch(e){res.status(400).json({message:e.message});}
});

const PORT=process.env.PORT||5000;
mongoose.connect(process.env.MONGO_URI||"mongodb://127.0.0.1:27017/clothshop_inventory")
.then(()=>app.listen(PORT,()=>console.log(`API running on http://localhost:${PORT}`)))
.catch(err=>{console.error("MongoDB connection failed:",err.message); process.exit(1);});
