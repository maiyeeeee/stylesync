// Walk-in, full-price multi-item checkout. No booking, loyalty redemption,
// promotions, offline reconciliation or historical backdating in this route.
const express = require('express')
const crypto = require('node:crypto')
const db = require('../db')
const router = express.Router()
const pool = db.promise()
const money = (c) => (c / 100).toFixed(2)
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const cents = (v) => {
  const s = String(v)
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw fail('Invalid catalog price', 409)
  const [a,b=''] = s.split('.')
  const n = Number(a)*100 + Number(b.padEnd(2,'0'))
  if (!Number.isSafeInteger(n) || n < 0) throw fail('Invalid catalog price',409)
  return n
}
const id = v => Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v) : null

router.post('/', async (req,res) => {
  let conn, begun=false
  try {
    if (!req.user || !['owner','admin','user'].includes(req.user.role)) throw fail('Not authorized',403)
    const body=req.body||{}
    const customer=String(body.customer||'').trim().replace(/\s+/g,' ')
    if (!customer || customer.length>100) throw fail('Enter a valid customer name')
    const customerContact=String(body.customer_contact||'').trim()
    if (customerContact.length>30 || (customerContact && !/^[+0-9 ()-]{7,30}$/.test(customerContact))) throw fail('Enter a valid customer contact number')
    if (!['Cash','GCash'].includes(body.payment)) throw fail('Select Cash or GCash')
    if (body.payment!=='Cash' && !String(body.payment_reference||'').trim()) throw fail('Verified GCash reference required')
    if (body.payment_confirmed!==true) throw fail('Confirm payment before saving')
    const key=String(body.checkout_key||'')
    if (!/^[a-f0-9-]{36}$/i.test(key) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) throw fail('Invalid checkout key')
    if (!Array.isArray(body.items) || body.items.length<1 || body.items.length>30) throw fail('Choose 1–30 unique items')
    const seen=new Set()
    const entries=body.items.map(x=>{
      const type=x.type, itemId=id(x.id), quantity=Number(x.quantity)
      if (!['Service','Product'].includes(type)||!itemId||!Number.isSafeInteger(quantity)||quantity<1||quantity>100) throw fail('Invalid cart item or quantity')
      if (type==='Service' && quantity!==1) throw fail('Add each service once per checkout')
      const k=`${type}:${itemId}`
      if(seen.has(k)) throw fail('Duplicate cart item')
      seen.add(k)
      return {type,itemId,quantity}
    })
    conn=await pool.getConnection()
    await conn.beginTransaction(); begun=true
    const [existing]=await conn.query('SELECT transaction_id FROM transactions WHERE offline_id=? FOR UPDATE',[key])
    if(existing.length){await conn.rollback();begun=false;return res.json({duplicate:true,id:existing[0].transaction_id})}
    let total=0
    for(const x of entries){
      if(x.type==='Service'){
        const [rows]=await conn.query('SELECT service,price,status FROM services WHERE service_id=? FOR UPDATE',[x.itemId])
        if(!rows.length||rows[0].status!=='Available') throw fail('Service unavailable',409)
        x.name=rows[0].service;x.unit=cents(rows[0].price)
      }else{
        const [rows]=await conn.query('SELECT name,price,stock,alertLevel FROM inventory WHERE id=? FOR UPDATE',[x.itemId])
        if(!rows.length||rows[0].stock<x.quantity) throw fail('Product unavailable or insufficient stock',409)
        x.name=rows[0].name;x.unit=cents(rows[0].price);x.remaining=rows[0].stock-x.quantity;x.alertLevel=rows[0].alertLevel
      }
      x.line=x.unit*x.quantity
      if(!Number.isSafeInteger(x.line)) throw fail('Cart amount too large')
      total+=x.line
    }
    if(total<1||total>999999999) throw fail('Cart total outside allowed range')
    // Optional optimistic price confirmation: never trust client totals as authority.
    if(body.expected_total!==money(total)) throw fail('Catalog prices changed. Refresh the cart before paying.',409)
    const [result]=await conn.query(`INSERT INTO transactions
      (customer,customer_contact,service,amount,payment,status,sale_type,item_id,quantity,offline_id,
       subtotal,discount_type,discount_percent,discount_amount,discount_decision,
       discount_reason,discount_approved_by,promotion_id)
      VALUES (?,?,?,?,?,'Paid','Mixed',NULL,1,?,?,NULL,NULL,'0.00',NULL,NULL,NULL,NULL)`,
      [customer,customerContact||null,`Multi-item checkout (${entries.length} items)`,money(total),body.payment,key,money(total)])
    for(const x of entries){
      await conn.query(`INSERT INTO transaction_items
        (transaction_id,item_type,catalog_id,item_name,quantity,unit_price,line_total)
        VALUES (?,?,?,?,?,?,?)`,[result.insertId,x.type,x.itemId,x.name,x.quantity,money(x.unit),money(x.line)])
      if(x.type==='Product'){
        const [stock]=await conn.query(`UPDATE inventory SET stock=?,status=? WHERE id=? AND stock>=?`,[x.remaining,x.remaining===0?'Out of Stock':x.remaining<=x.alertLevel?'Low Stock':'In Stock',x.itemId,x.quantity])
        if(stock.affectedRows!==1) throw fail('Product stock changed',409)
        await conn.query('INSERT INTO inventory_movements (item_id,quantity_change,reason,offline_id) VALUES (?,?,?,NULL)',[x.itemId,-x.quantity,`Multi-item checkout #${result.insertId}`])
      }
    }
    await conn.commit();begun=false
    res.status(201).json({id:result.insertId,amount:money(total),items:entries.map(x=>({type:x.type,id:x.itemId,name:x.name,quantity:x.quantity,unit_price:money(x.unit),line_total:money(x.line)}))})
  }catch(err){
    if(conn&&begun) try{await conn.rollback()}catch(e){console.error('Cart rollback error',e)}
    if(err.code==='ER_DUP_ENTRY') return res.status(409).json({error:'Checkout already recorded; refresh transaction history before retrying.'})
    if(!err.status) console.error('Cart checkout error',err)
    res.status(err.status||500).json({error:err.status?err.message:'Unable to complete checkout.'})
  }finally{if(conn) conn.release()}
})
router.get('/:transactionId',async(req,res)=>{
  try{
    if(!req.user) return res.status(401).json({error:'Sign in required'})
    const transactionId=id(req.params.transactionId)
    if(!transactionId) return res.status(400).json({error:'Invalid transaction ID'})
    const [rows]=await pool.query('SELECT item_type AS type,catalog_id AS id,item_name AS name,quantity,unit_price,line_total FROM transaction_items WHERE transaction_id=? ORDER BY item_id',[transactionId])
    res.json(rows)
  }catch(err){console.error('Cart items error',err);res.status(500).json({error:'Unable to load items'})}
})
module.exports=router
