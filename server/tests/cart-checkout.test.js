// Contract tests for multi-item cart route; mocks SQL connection, never contacts TiDB.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const routePath = path.resolve(__dirname, '../routes/cartCheckoutRoutes.js')
function harness({ insufficient = false, duplicate = false } = {}) {
  const queries=[]
  let committed=0, rolledBack=0
  const connection={
    async beginTransaction(){}, async commit(){committed++}, async rollback(){rolledBack++}, release(){},
    async query(sql,params=[]){
      queries.push({sql,params})
      if(sql.includes('FROM transactions WHERE offline_id')) return [[...(duplicate?[{transaction_id:99}]:[])] ]
      if(sql.includes('FROM services WHERE')) return [[{service:'Haircut',price:'350.00',status:'Available'}]]
      if(sql.includes('FROM inventory WHERE')) return [[{name:'Hair Mask',price:'450.00',stock:insufficient?0:10,alertLevel:2}]]
      if(sql.includes('INSERT INTO transactions')) return [{insertId:41}]
      if(sql.includes('UPDATE inventory')) return [{affectedRows:1}]
      return [[]]
    }
  }
  const original=Module._load
  try{
    Module._load=function(request,parent,isMain){
      if(parent?.filename===routePath && request==='../db') return {promise:()=>({getConnection:async()=>connection})}
      return original.apply(this,arguments)
    }
    delete require.cache[routePath]
    const router=require(routePath)
    const layer=router.stack.find(x=>x.route?.path==='/' && x.route.methods.post)
    return {handler:layer.route.stack.at(-1).handle,queries,stats:()=>({committed,rolledBack})}
  }finally{Module._load=original;delete require.cache[routePath]}
}
const payload={customer:'Test Customer',payment:'Cash',payment_confirmed:true,
  checkout_key:'bb6ec4a5-24dd-43df-85d1-2c931e80a13b',expected_total:'1250.00',
  items:[{type:'Service',id:1,quantity:1},{type:'Product',id:2,quantity:2}]}
async function call(handler,body=payload){
  let status=200,response
  const res={status(n){status=n;return this},json(x){response=x;return this}}
  await handler({user:{role:'admin',user_id:1},body},res)
  return {status,response}
}
test('atomic mixed checkout writes one parent, two lines, one stock movement',async()=>{
  const h=harness();const r=await call(h.handler)
  assert.equal(r.status,201)
  assert.equal(r.response.amount,'1250.00')
  assert.equal(h.queries.filter(x=>x.sql.includes('INSERT INTO transactions')).length,1)
  assert.equal(h.queries.filter(x=>x.sql.includes('INSERT INTO transaction_items')).length,2)
  assert.equal(h.queries.filter(x=>x.sql.includes('INSERT INTO inventory_movements')).length,1)
  assert.equal(h.stats().committed,1)
})
test('insufficient product stock rolls back and does not insert a sale',async()=>{
  const h=harness({insufficient:true});const r=await call(h.handler)
  assert.equal(r.status,409)
  assert.equal(h.stats().rolledBack,1)
  assert.equal(h.queries.filter(x=>x.sql.includes('INSERT INTO transactions')).length,0)
})
test('duplicate checkout key returns original transaction without another insert',async()=>{
  const h=harness({duplicate:true});const r=await call(h.handler)
  assert.equal(r.response.duplicate,true)
  assert.equal(r.response.id,99)
  assert.equal(h.queries.filter(x=>x.sql.includes('INSERT INTO transactions')).length,0)
})
test('rejects unconfirmed payment before acquiring database connection',async()=>{
  const h=harness();const r=await call(h.handler,{...payload,payment_confirmed:false})
  assert.equal(r.status,400)
  assert.equal(h.queries.length,0)
})

test('saves customer contact on the parent mixed checkout',async()=>{
  const h=harness()
  const r=await call(h.handler,{...payload,customer_contact:'09000000021'})
  assert.equal(r.status,201)
  const insert=h.queries.find(x=>x.sql.includes('INSERT INTO transactions'))
  assert.match(insert.sql,/customer_contact/)
  assert.equal(insert.params[1],'09000000021')
})
test('rejects malformed contact before any database query',async()=>{
  const h=harness()
  const r=await call(h.handler,{...payload,customer_contact:'not-a-number'})
  assert.equal(r.status,400)
  assert.equal(h.queries.length,0)
})
