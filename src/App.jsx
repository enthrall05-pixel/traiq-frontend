import { useState, useCallback, useEffect, useRef } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:8001";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const A="#c8f45a",BG="#0a0a0a",SF="#111111",BD="#1e1e1e",MU="#3a3a3a",TX="#e8e8e8",DM="#6b6b6b";
const STRATEGIES = [
  {id:"rsi_momentum", label:"RSI Momentum",     params:[{key:"rsi_buy",label:"Buy below RSI",default:32},{key:"rsi_sell",label:"Sell above RSI",default:68}]},
  {id:"macd_cross",   label:"MACD Crossover",   params:[]},
  {id:"bb_reversion", label:"Bollinger Reversion",params:[]},
  {id:"sma_cross",    label:"SMA 20/50 Cross",  params:[]},
];
const PERIODS = [{id:"3mo",label:"3 Months"},{id:"6mo",label:"6 Months"},{id:"1y",label:"1 Year"},{id:"2y",label:"2 Years"}];
const SIGNAL_COLOR = {BUY:"#c8f45a",SELL:"#ff6b6b",NEUTRAL:"#6b6b6b"};
const SIGNAL_BG    = {BUY:"rgba(200,244,90,0.1)",SELL:"rgba(255,107,107,0.1)",NEUTRAL:"rgba(107,107,107,0.1)"};

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function apiCall(path, method="GET", body=null, token=null) {
  const headers = {"Content-Type":"application/json"};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
function EquityCurve({data, color}){
  if(!data||data.length<2)return null;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1,w=100/(data.length-1);
  const pts=data.map((v,i)=>`${i*w},${100-((v-mn)/rng)*88+6}`).join(" ");
  const c = color || (data[data.length-1]>=data[0]?"#c8f45a":"#ff6b6b");
  return(<svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"90px"}}>
    <defs><linearGradient id={`g${c.replace("#","")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.2"/><stop offset="100%" stopColor={c} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`${pts} ${(data.length-1)*w},100 0,100`} fill={`url(#g${c.replace("#","")})`}/>
    <polyline points={pts} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
  </svg>);
}
function BarChart({data}){
  const max=Math.max(...data.map(d=>Math.abs(d.return)),0.01);
  return(<div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"60px"}}>
    {data.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"60px",justifyContent:"flex-end"}}>
      <div title={`${d.month}: ${d.return>0?"+":""}${d.return}%`} style={{width:"100%",height:`${Math.max(2,Math.abs(d.return)/max*56)}px`,background:d.return>=0?"#c8f45a":"#ff6b6b",borderRadius:"2px 2px 0 0",opacity:.85}}/>
    </div>)}
  </div>);
}
function Logo({size=28}){return(<svg width={size} height={size} viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#c8f45a"/><polyline points="6,28 14,16 22,22 34,10" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="34" cy="10" r="3" fill="#0a0a0a"/></svg>);}
const IcoHome=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoBell=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IcoSave=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IcoUser=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

// ─── TICKER SEARCH ────────────────────────────────────────────────────────────
function TickerSearch({value, onChange, onSelect}) {
  const [results,setResults]=useState([]);
  const [open,setOpen]=useState(false);
  const debounce=useRef(null);

  const search = useCallback(async(q)=>{
    if(q.length<1){setResults([]);return;}
    try{
      const data=await apiCall(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results||[]);
      setOpen(true);
    }catch{setResults([]);}
  },[]);

  return(
    <div style={{position:"relative",flex:1}}>
      <input className="ti" type="text" value={value}
        onChange={e=>{onChange(e.target.value);clearTimeout(debounce.current);debounce.current=setTimeout(()=>search(e.target.value),300);}}
        onFocus={()=>value.length>0&&setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        placeholder="Search any ticker — AAPL, BTC, NVDA..."/>
      {open&&results.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#181818",border:`1px solid ${BD}`,borderRadius:"10px",marginTop:"4px",zIndex:200,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          {results.slice(0,8).map((r,i)=>(
            <div key={i} onClick={()=>{onSelect(r.symbol);setOpen(false);}}
              style={{padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:i<results.length-1?`1px solid ${BD}`:"none"}}
              onMouseEnter={e=>e.currentTarget.style.background="#1e1e1e"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div>
                <span style={{color:"#fff",fontWeight:"600",fontSize:"13px"}}>{r.symbol}</span>
                <span style={{color:DM,fontSize:"12px",marginLeft:"8px"}}>{r.name}</span>
              </div>
              <span style={{fontSize:"10px",color:DM,background:"#1a1a1a",padding:"2px 8px",borderRadius:"4px"}}>{r.type||"stock"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RESULT CARD ──────────────────────────────────────────────────────────────
function ResultCard({r, label, color}) {
  if(!r)return null;
  const isPos=r.totalReturn>=0;
  const c=color||(isPos?"#c8f45a":"#ff6b6b");
  return(
    <div style={{background:SF,border:`1px solid ${BD}`,borderRadius:"14px",padding:"16px",flex:1,minWidth:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
        <div>
          {label&&<div style={{fontSize:"10px",color:DM,letterSpacing:"1px",marginBottom:"4px",fontFamily:"'DM Mono',monospace"}}>{label}</div>}
          <div style={{fontWeight:"700",color:"#fff",fontSize:"15px"}}>{r.strategyName}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px"}}>
          <div style={{fontSize:"22px",fontWeight:"700",color:c,fontFamily:"'DM Mono',monospace"}}>{isPos?"+":""}{r.totalReturn}%</div>
          {r.currentSignal&&(
            <div style={{background:SIGNAL_BG[r.currentSignal],border:`1px solid ${SIGNAL_COLOR[r.currentSignal]}`,borderRadius:"6px",padding:"3px 10px",fontSize:"11px",color:SIGNAL_COLOR[r.currentSignal],fontWeight:"700",letterSpacing:"1px"}}>
              {r.currentSignal}
            </div>
          )}
        </div>
      </div>
      <EquityCurve data={r.equityCurve} color={c}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginTop:"10px"}}>
        {[
          {l:"SHARPE",v:r.sharpeRatio,c:r.sharpeRatio>=1.5?A:r.sharpeRatio>=0.5?"#f5c842":"#ff6b6b"},
          {l:"DRAWDOWN",v:`${r.maxDrawdown}%`,c:"#ff6b6b"},
          {l:"WIN RATE",v:`${r.winRate}%`,c:r.winRate>=55?A:r.winRate>=45?"#f5c842":"#ff6b6b"},
          {l:"TRADES",v:r.totalTrades,c:TX},
        ].map((m,i)=>(
          <div key={i} style={{background:"#0e0e0e",borderRadius:"8px",padding:"10px 12px"}}>
            <div style={{color:DM,fontSize:"9px",letterSpacing:"1px",marginBottom:"4px",fontFamily:"'DM Mono',monospace"}}>{m.l}</div>
            <div style={{fontSize:"16px",fontWeight:"700",color:m.c,fontFamily:"'DM Mono',monospace"}}>{m.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({onAuth}) {
  const [mode,setMode]=useState("login"); // login | signup
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const submit=async()=>{
    if(!email||!password){setError("Please enter email and password");return;}
    setLoading(true);setError("");setSuccess("");
    try{
      const SUPA_URL=import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY=import.meta.env.VITE_SUPABASE_KEY;
      if(mode==="signup"){
        const res=await fetch(`${SUPA_URL}/auth/v1/signup`,{
          method:"POST",
          headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
          body:JSON.stringify({email,password}),
        });
        const data=await res.json();
        if(!res.ok)throw new Error(data.msg||data.error_description||"Signup failed");
        // Auto sign in after signup
        const res2=await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{
          method:"POST",
          headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
          body:JSON.stringify({email,password}),
        });
        const data2=await res2.json();
        if(!res2.ok)throw new Error("Account created — please sign in.");
        onAuth({token:data2.access_token,email,id:data2.user?.id});
      } else {
        const res=await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{
          method:"POST",
          headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
          body:JSON.stringify({email,password}),
        });
        const data=await res.json();
        if(!res.ok)throw new Error(data.error_description||data.msg||"Invalid credentials");
        onAuth({token:data.access_token,email,id:data.user?.id});
      }
    }catch(e){setError(e.message);}
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{marginBottom:"32px",display:"flex",alignItems:"center",gap:"10px"}}>
        <Logo size={40}/><span style={{fontWeight:"800",fontSize:"26px",color:"#fff",letterSpacing:"-1px"}}>traiq</span>
      </div>
      <div style={{background:SF,border:`1px solid ${BD}`,borderRadius:"16px",padding:"28px",width:"100%",maxWidth:"380px"}}>
        <h2 style={{color:"#fff",fontWeight:"700",fontSize:"20px",margin:"0 0 4px",letterSpacing:"-0.5px"}}>
          {mode==="login"?"Welcome back":"Create account"}
        </h2>
        <p style={{color:DM,fontSize:"13px",margin:"0 0 24px"}}>Your pocket quant analyst</p>

        {error&&<div style={{background:"#180f0f",border:"1px solid #3d1515",borderRadius:"8px",padding:"10px 14px",color:"#ff6b6b",fontSize:"13px",marginBottom:"16px"}}>⚠️ {error}</div>}
        {success&&<div style={{background:"rgba(200,244,90,0.08)",border:"1px solid rgba(200,244,90,0.3)",borderRadius:"8px",padding:"10px 14px",color:A,fontSize:"13px",marginBottom:"16px"}}>✓ {success}</div>}

        <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          <input className="auth-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address"/>
          <input className="auth-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Password"/>
          <button onClick={submit} disabled={loading}
            style={{background:A,border:"none",borderRadius:"10px",color:"#000",padding:"14px",fontWeight:"700",fontSize:"15px",cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1}}>
            {loading?"...":(mode==="login"?"Sign in":"Create account")}
          </button>
        </div>

        <div style={{textAlign:"center",marginTop:"20px",color:DM,fontSize:"13px"}}>
          {mode==="login"?"Don't have an account?":"Already have an account?"}{" "}
          <span onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}
            style={{color:A,cursor:"pointer",fontWeight:"600"}}>
            {mode==="login"?"Sign up":"Sign in"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("home");

  // Backtest state
  const [symbol,setSymbol]=useState("");
  const [period,setPeriod]=useState("1y");
  const [strategy,setStrategy]=useState("rsi_momentum");
  const [params,setParams]=useState({rsi_buy:32,rsi_sell:68});
  const [status,setStatus]=useState(null);
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");

  // Compare state
  const [compareMode,setCompareMode]=useState(false);
  const [strategyB,setStrategyB]=useState("macd_cross");
  const [compareResult,setCompareResult]=useState(null);

  // Saved + alerts
  const [saved,setSaved]=useState([]);
  const [alerts,setAlerts]=useState([]);
  const [alertForm,setAlertForm]=useState({symbol:"",strategy:"rsi_momentum",condition:"buy_signal",threshold:""});
  const [saveName,setSaveName]=useState("");
  const [showSaveModal,setShowSaveModal]=useState(false);
  const [showAlertModal,setShowAlertModal]=useState(false);

  // Market snapshot
  const [snapshot,setSnapshot]=useState([]);

  const loading=status==="running";
  const stratDef=STRATEGIES.find(s=>s.id===strategy);

  // Load snapshot on mount
  useEffect(()=>{
    apiCall("/market/snapshot").then(d=>setSnapshot(d.snapshot||[])).catch(()=>{});
  },[]);

  // Load saved + alerts when user logs in
  useEffect(()=>{
    if(!user)return;
    apiCall("/strategies","GET",null,user.token).then(d=>setSaved(d.strategies||[])).catch(()=>{});
    apiCall("/alerts","GET",null,user.token).then(d=>setAlerts(d.alerts||[])).catch(()=>{});
  },[user]);

  const run=useCallback(async()=>{
    if(!symbol.trim()){setError("Please enter a ticker symbol");return;}
    setError("");setResult(null);setCompareResult(null);setStatus("running");
    try{
      if(compareMode){
        const data=await apiCall("/compare","POST",{symbol:symbol.trim().toUpperCase(),period,strategy_a:strategy,params_a:params,strategy_b:strategyB,params_b:{}});
        setCompareResult(data);
      } else {
        const data=await apiCall("/backtest","POST",{symbol:symbol.trim().toUpperCase(),period,strategy,params});
        setResult(data);
      }
      setStatus("done");
    }catch(e){setError(e.message);setStatus("error");}
  },[symbol,period,strategy,params,strategyB,compareMode]);

  const saveStrategy=async()=>{
    if(!user){setError("Sign in to save strategies");return;}
    if(!result||!saveName){return;}
    try{
      await apiCall("/strategies","POST",{name:saveName,symbol:result.symbol,period:result.period,strategy:result.strategy,params,results:result},user.token);
      const d=await apiCall("/strategies","GET",null,user.token);
      setSaved(d.strategies||[]);
      setShowSaveModal(false);setSaveName("");
    }catch(e){setError(e.message);}
  };

  const createAlert=async()=>{
    if(!user){setError("Sign in to set alerts");return;}
    try{
      await apiCall("/alerts","POST",{...alertForm,symbol:alertForm.symbol||symbol,threshold:alertForm.threshold?parseFloat(alertForm.threshold):null},user.token);
      const d=await apiCall("/alerts","GET",null,user.token);
      setAlerts(d.alerts||[]);
      setShowAlertModal(false);
    }catch(e){setError(e.message);}
  };

  const deleteAlert=async(id)=>{
    await apiCall(`/alerts/${id}`,"DELETE",null,user.token);
    setAlerts(prev=>prev.filter(a=>a.id!==id));
  };

  const deleteSaved=async(id)=>{
    await apiCall(`/strategies/${id}`,"DELETE",null,user.token);
    setSaved(prev=>prev.filter(s=>s.id!==id));
  };

  if(!user) return <AuthScreen onAuth={setUser}/>;

  return(<div style={{minHeight:"100vh",background:BG,color:TX,fontFamily:"system-ui,sans-serif",paddingBottom:"72px"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      *{box-sizing:border-box;}
      .ti,.auth-input{background:transparent!important;border:none!important;outline:none!important;color:#e8e8e8!important;font-size:15px!important;font-family:'DM Sans',system-ui,sans-serif!important;padding:12px 0!important;flex:1!important;width:100%!important;min-width:0!important;}
      .auth-input{background:#0e0e0e!important;border:1px solid #1e1e1e!important;border-radius:10px!important;padding:12px 16px!important;width:100%!important;display:block;}
      .ti::placeholder,.auth-input::placeholder{color:#3a3a3a;}
      .auth-input:focus{border-color:#c8f45a!important;}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
      .pill{background:transparent;border:1px solid #1e1e1e;border-radius:8px;color:#6b6b6b;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit;transition:all 0.15s;white-space:nowrap;}
      .pill.active{background:#1a1a1a;border-color:#3a3a3a;color:#e8e8e8;}
      .pill:hover{border-color:#3a3a3a;color:#e8e8e8;}
      .navbtn{display:flex;flex-direction:column;align-items:center;gap:3px;background:transparent;border:none;cursor:pointer;padding:8px 12px;flex:1;-webkit-tap-highlight-color:transparent;}
      .card{background:#111111;border:1px solid #1e1e1e;border-radius:14px;padding:16px;}
      .runbtn{background:#c8f45a;border:none;border-radius:12px;color:#000;padding:13px 22px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:inherit;transition:opacity 0.15s;}
      .runbtn:disabled{background:#1a1a1a;color:#6b6b6b;cursor:not-allowed;}
      .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:flex-end;justify-content:center;}
      .modal{background:#141414;border:1px solid #1e1e1e;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;}
      .icon-btn{background:transparent;border:1px solid #1e1e1e;border-radius:8px;color:#6b6b6b;padding:8px 12px;cursor:pointer;font-family:inherit;font-size:12px;display:flex;align-items:center;gap:6px;transition:all 0.15s;}
      .icon-btn:hover{border-color:#3a3a3a;color:#e8e8e8;}
    `}</style>

    {/* TOP BAR */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:"52px",borderBottom:`1px solid ${BD}`,background:BG,position:"sticky",top:0,zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        <Logo size={28}/><span style={{fontWeight:"700",fontSize:"18px",color:"#fff",letterSpacing:"-0.5px"}}>traiq</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        {snapshot.slice(0,2).map(s=>(
          <div key={s.symbol} style={{display:"flex",gap:"5px",alignItems:"center"}}>
            <span style={{color:DM,fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>{s.symbol}</span>
            <span style={{color:s.changePct>=0?"#c8f45a":"#ff6b6b",fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>{s.changePct>=0?"+":""}{s.changePct}%</span>
          </div>
        ))}
        <button onClick={()=>setUser(null)} style={{background:"transparent",border:`1px solid ${BD}`,borderRadius:"6px",color:DM,padding:"5px 10px",fontSize:"11px",cursor:"pointer"}}>
          Sign out
        </button>
      </div>
    </div>

    <div style={{maxWidth:"680px",margin:"0 auto",padding:"16px 16px"}}>

      {/* ── HOME TAB ── */}
      {tab==="home"&&(<>
        {/* Input card */}
        <div className="card" style={{marginBottom:"12px"}}>
          <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"12px"}}>
            <TickerSearch value={symbol} onChange={setSymbol} onSelect={setSymbol}/>
            <button className="runbtn" onClick={run} disabled={loading||!symbol.trim()}>
              {loading?"Running...":"Run →"}
            </button>
          </div>

          {/* Period pills */}
          <div style={{display:"flex",gap:"6px",marginBottom:"12px",overflowX:"auto",scrollbarWidth:"none"}}>
            {PERIODS.map(p=><button key={p.id} className={`pill${period===p.id?" active":""}`} onClick={()=>setPeriod(p.id)}>{p.label}</button>)}
          </div>

          {/* Strategy pills */}
          <div style={{display:"flex",gap:"6px",overflowX:"auto",scrollbarWidth:"none",marginBottom:"12px"}}>
            {STRATEGIES.map(s=><button key={s.id} className={`pill${strategy===s.id?" active":""}`} onClick={()=>setStrategy(s.id)}>{s.label}</button>)}
          </div>

          {/* Strategy params */}
          {stratDef?.params.length>0&&(
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
              {stratDef.params.map(p=>(
                <div key={p.key} style={{flex:1,minWidth:"120px"}}>
                  <div style={{color:DM,fontSize:"10px",marginBottom:"4px",fontFamily:"'DM Mono',monospace",letterSpacing:"1px"}}>{p.label.toUpperCase()}</div>
                  <input type="number" value={params[p.key]||p.default}
                    onChange={e=>setParams(prev=>({...prev,[p.key]:parseInt(e.target.value)}))}
                    style={{background:"#0e0e0e",border:`1px solid ${BD}`,borderRadius:"8px",color:TX,padding:"8px 12px",fontSize:"14px",width:"100%",fontFamily:"'DM Mono',monospace",outline:"none"}}/>
                </div>
              ))}
            </div>
          )}

          {/* Compare toggle */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${BD}`}}>
            <span style={{color:DM,fontSize:"13px"}}>Compare two strategies</span>
            <button onClick={()=>setCompareMode(!compareMode)} style={{background:compareMode?A:"transparent",border:`1px solid ${compareMode?A:BD}`,borderRadius:"20px",color:compareMode?"#000":DM,padding:"5px 14px",fontSize:"12px",cursor:"pointer",fontWeight:"600"}}>
              {compareMode?"ON":"OFF"}
            </button>
          </div>
          {compareMode&&(
            <div style={{display:"flex",gap:"6px",marginTop:"10px",overflowX:"auto",scrollbarWidth:"none"}}>
              {STRATEGIES.filter(s=>s.id!==strategy).map(s=>(
                <button key={s.id} className={`pill${strategyB===s.id?" active":""}`} onClick={()=>setStrategyB(s.id)}>{s.label}</button>
              ))}
            </div>
          )}
        </div>

        {error&&<div style={{background:"#180f0f",border:"1px solid #3d1515",borderRadius:"12px",padding:"12px 16px",color:"#ff6b6b",fontSize:"13px",marginBottom:"12px"}}>⚠️ {error}</div>}

        {loading&&(
          <div className="card" style={{textAlign:"center",padding:"40px 24px"}}>
            <div style={{fontSize:"32px",marginBottom:"12px"}}>⚙️</div>
            <div style={{color:"#fff",fontWeight:"600",fontSize:"15px",marginBottom:"6px"}}>Fetching real market data...</div>
            <div style={{color:DM,fontSize:"12px",fontFamily:"'DM Mono',monospace"}}>Alpaca · Live prices · Running backtest</div>
          </div>
        )}

        {/* Single result */}
        {status==="done"&&result&&!compareMode&&(
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {/* Header */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"12px"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
                    <span style={{background:"#1a1a1a",border:`1px solid ${BD}`,borderRadius:"6px",padding:"2px 10px",fontSize:"11px",color:A,fontFamily:"'DM Mono',monospace"}}>{result.symbol}</span>
                    <span style={{color:DM,fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>{result.period} · ${result.currentPrice}</span>
                    <span style={{background:SIGNAL_BG[result.currentSignal],border:`1px solid ${SIGNAL_COLOR[result.currentSignal]}`,borderRadius:"6px",padding:"2px 8px",fontSize:"10px",color:SIGNAL_COLOR[result.currentSignal],fontWeight:"700"}}>
                      {result.currentSignal}
                    </span>
                  </div>
                  <div style={{fontSize:"18px",fontWeight:"700",color:"#fff"}}>{result.strategyName}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"28px",fontWeight:"700",color:result.totalReturn>=0?A:"#ff6b6b",fontFamily:"'DM Mono',monospace"}}>{result.totalReturn>=0?"+":""}{result.totalReturn}%</div>
                  <div style={{color:DM,fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>${(10000*(1+result.totalReturn/100)).toFixed(0)} from $10k</div>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
              {[
                {l:"SHARPE",v:result.sharpeRatio,c:result.sharpeRatio>=1.5?A:result.sharpeRatio>=0.5?"#f5c842":"#ff6b6b"},
                {l:"DRAWDOWN",v:`${result.maxDrawdown}%`,c:"#ff6b6b"},
                {l:"WIN RATE",v:`${result.winRate}%`,c:result.winRate>=55?A:result.winRate>=45?"#f5c842":"#ff6b6b"},
                {l:"PROFIT FACTOR",v:result.profitFactor,c:result.profitFactor>=1.5?A:"#f5c842"},
                {l:"TRADES",v:result.totalTrades,c:TX},
                {l:"DATA POINTS",v:result.dataPoints,c:TX},
              ].map((m,i)=>(
                <div key={i} className="card" style={{padding:"12px"}}>
                  <div style={{color:DM,fontSize:"9px",letterSpacing:"1px",marginBottom:"6px",fontFamily:"'DM Mono',monospace"}}>{m.l}</div>
                  <div style={{fontSize:"18px",fontWeight:"700",color:m.c,fontFamily:"'DM Mono',monospace"}}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                <span style={{color:DM,fontSize:"10px",letterSpacing:"1px",fontFamily:"'DM Mono',monospace"}}>EQUITY CURVE</span>
                <span style={{color:result.totalReturn>=0?A:"#ff6b6b",fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>$10k → ${(10000*(1+result.totalReturn/100)).toFixed(0)}</span>
              </div>
              <EquityCurve data={result.equityCurve}/>
            </div>
            <div className="card">
              <div style={{color:DM,fontSize:"10px",letterSpacing:"1px",marginBottom:"8px",fontFamily:"'DM Mono',monospace"}}>MONTHLY RETURNS</div>
              <BarChart data={result.monthlyReturns}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                {result.monthlyReturns.map((d,i)=><div key={i} style={{color:MU,fontSize:"8px",flex:1,textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{d.month[0]}</div>)}
              </div>
            </div>

            {/* Trades */}
            {result.trades?.length>0&&(
              <div className="card">
                <div style={{color:DM,fontSize:"10px",letterSpacing:"1px",marginBottom:"10px",fontFamily:"'DM Mono',monospace"}}>RECENT TRADES · {result.totalTrades} total</div>
                <div style={{maxHeight:"180px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"4px"}}>
                  {result.trades.slice().reverse().map((t,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 50px 80px",gap:"8px",padding:"8px 10px",background:"#0e0e0e",borderRadius:"8px",fontFamily:"'DM Mono',monospace",fontSize:"12px"}}>
                      <span style={{color:DM}}>${t.entry.toFixed(2)}</span>
                      <span style={{color:DM}}>${t.exit.toFixed(2)}</span>
                      <span style={{color:DM}}>{t.bars}d</span>
                      <span style={{color:t.return>=0?A:"#ff6b6b",fontWeight:"700",textAlign:"right"}}>{t.return>=0?"+":""}{t.return.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              <button className="icon-btn" onClick={()=>setShowSaveModal(true)}>
                <IcoSave/> Save strategy
              </button>
              <button className="icon-btn" onClick={()=>{setAlertForm(prev=>({...prev,symbol:result.symbol,strategy:result.strategy}));setShowAlertModal(true);}}>
                <IcoBell/> Set alert
              </button>
              <button className="icon-btn" onClick={()=>{setResult(null);setStatus(null);}}>
                ← New backtest
              </button>
            </div>
          </div>
        )}

        {/* Compare result */}
        {status==="done"&&compareResult&&compareMode&&(
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
              <div>
                <span style={{background:"#1a1a1a",border:`1px solid ${BD}`,borderRadius:"6px",padding:"2px 10px",fontSize:"11px",color:A,fontFamily:"'DM Mono',monospace"}}>{compareResult.symbol}</span>
                <span style={{color:DM,fontSize:"12px",marginLeft:"8px",fontFamily:"'DM Mono',monospace"}}>{compareResult.period} · ${compareResult.currentPrice}</span>
              </div>
              <div style={{background:compareResult.winner==="a"?"rgba(200,244,90,0.1)":"rgba(255,107,107,0.1)",border:`1px solid ${compareResult.winner==="a"?A:"#ff6b6b"}`,borderRadius:"8px",padding:"6px 12px",fontSize:"12px",color:compareResult.winner==="a"?A:"#ff6b6b",fontWeight:"700"}}>
                {compareResult.winner==="a"?compareResult.a.strategyName:compareResult.b.strategyName} wins
              </div>
            </div>
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
              <ResultCard r={compareResult.a} label="STRATEGY A" color={A}/>
              <ResultCard r={compareResult.b} label="STRATEGY B" color="#58a6ff"/>
            </div>
            <button className="icon-btn" onClick={()=>{setCompareResult(null);setStatus(null);}}>← New comparison</button>
          </div>
        )}
      </>)}

      {/* ── ALERTS TAB ── */}
      {tab==="alerts"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <div>
              <div style={{fontSize:"20px",fontWeight:"700",color:"#fff"}}>Alerts</div>
              <div style={{color:DM,fontSize:"13px",marginTop:"2px"}}>Get notified when signals trigger</div>
            </div>
            <button className="runbtn" style={{padding:"10px 16px",fontSize:"13px"}} onClick={()=>setShowAlertModal(true)}>+ New alert</button>
          </div>
          {alerts.length===0
            ?<div className="card" style={{textAlign:"center",padding:"40px",color:DM}}>No alerts yet.<br/>Set one from a backtest result.</div>
            :alerts.map(a=>(
              <div key={a.id} className="card" style={{marginBottom:"8px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
                    <span style={{color:"#fff",fontWeight:"600"}}>{a.symbol}</span>
                    <span style={{background:"#1a1a1a",border:`1px solid ${BD}`,borderRadius:"4px",padding:"1px 8px",fontSize:"10px",color:DM,fontFamily:"'DM Mono',monospace"}}>{a.condition.replace("_"," ").toUpperCase()}</span>
                    {a.is_active&&<span style={{width:"6px",height:"6px",borderRadius:"50%",background:"#c8f45a",display:"inline-block"}}/>}
                  </div>
                  <div style={{color:DM,fontSize:"12px",fontFamily:"'DM Mono',monospace"}}>{a.strategy.replace("_"," ")} {a.threshold?`· $${a.threshold}`:""}</div>
                  {a.last_triggered&&<div style={{color:DM,fontSize:"11px",marginTop:"3px"}}>Last triggered: {new Date(a.last_triggered).toLocaleDateString()}</div>}
                </div>
                <button onClick={()=>deleteAlert(a.id)} style={{background:"transparent",border:`1px solid ${BD}`,borderRadius:"8px",color:"#ff6b6b",padding:"6px 12px",cursor:"pointer",fontSize:"12px"}}>Remove</button>
              </div>
            ))
          }
        </div>
      )}

      {/* ── SAVED TAB ── */}
      {tab==="saved"&&(
        <div>
          <div style={{fontSize:"20px",fontWeight:"700",color:"#fff",marginBottom:"4px"}}>Saved Strategies</div>
          <div style={{color:DM,fontSize:"13px",marginBottom:"16px"}}>Your saved backtests</div>
          {saved.length===0
            ?<div className="card" style={{textAlign:"center",padding:"40px",color:DM}}>No saved strategies yet.<br/>Run a backtest and save it.</div>
            :saved.map(s=>(
              <div key={s.id} className="card" style={{marginBottom:"8px",cursor:"pointer"}}
                onClick={()=>{setSymbol(s.symbol);setPeriod(s.period);setStrategy(s.strategy);setParams(s.params||{});setTab("home");}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:"600",color:"#fff",fontSize:"14px"}}>{s.name}</div>
                    <div style={{color:DM,fontSize:"11px",marginTop:"3px",fontFamily:"'DM Mono',monospace"}}>{s.symbol} · {s.period} · {s.strategy.replace("_"," ")}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                    {s.results?.totalReturn!=null&&(
                      <span style={{color:s.results.totalReturn>=0?A:"#ff6b6b",fontWeight:"700",fontFamily:"'DM Mono',monospace",fontSize:"15px"}}>
                        {s.results.totalReturn>=0?"+":""}{s.results.totalReturn}%
                      </span>
                    )}
                    <button onClick={e=>{e.stopPropagation();deleteSaved(s.id);}} style={{background:"transparent",border:`1px solid ${BD}`,borderRadius:"6px",color:"#ff6b6b",padding:"4px 8px",cursor:"pointer",fontSize:"11px"}}>✕</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── PROFILE TAB ── */}
      {tab==="profile"&&(
        <div>
          <div style={{fontSize:"20px",fontWeight:"700",color:"#fff",marginBottom:"4px"}}>Profile</div>
          <div className="card" style={{marginBottom:"12px"}}>
            <div style={{color:DM,fontSize:"11px",marginBottom:"4px",fontFamily:"'DM Mono',monospace"}}>SIGNED IN AS</div>
            <div style={{color:"#fff",fontWeight:"600"}}>{user.email}</div>
          </div>
          <div className="card" style={{marginBottom:"12px"}}>
            <div style={{color:DM,fontSize:"11px",marginBottom:"12px",fontFamily:"'DM Mono',monospace"}}>MARKET SNAPSHOT</div>
            {snapshot.map(s=>(
              <div key={s.symbol} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BD}`}}>
                <span style={{color:"#fff",fontWeight:"600",fontFamily:"'DM Mono',monospace"}}>{s.symbol}</span>
                <div style={{display:"flex",gap:"12px",fontFamily:"'DM Mono',monospace",fontSize:"13px"}}>
                  <span style={{color:TX}}>${s.price.toLocaleString()}</span>
                  <span style={{color:s.changePct>=0?A:"#ff6b6b"}}>{s.changePct>=0?"+":""}{s.changePct}%</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>setUser(null)} style={{background:"transparent",border:`1px solid #3d1515`,borderRadius:"10px",color:"#ff6b6b",padding:"12px",fontSize:"14px",width:"100%",cursor:"pointer"}}>Sign out</button>
        </div>
      )}
    </div>

    {/* BOTTOM NAV */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:BG,borderTop:`1px solid ${BD}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {[
        {id:"home",   label:"Home",    Icon:IcoHome},
        {id:"alerts", label:"Alerts",  Icon:IcoBell},
        {id:"saved",  label:"Saved",   Icon:IcoSave},
        {id:"profile",label:"Profile", Icon:IcoUser},
      ].map(({id,label,Icon})=>(
        <button key={id} className="navbtn" onClick={()=>setTab(id)}>
          <span style={{color:tab===id?A:DM}}><Icon/></span>
          <span style={{fontSize:"10px",color:tab===id?A:DM,fontWeight:tab===id?"600":"400"}}>{label}</span>
        </button>
      ))}
    </div>

    {/* SAVE MODAL */}
    {showSaveModal&&(
      <div className="modal-overlay" onClick={()=>setShowSaveModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:"700",fontSize:"17px",color:"#fff",marginBottom:"4px"}}>Save Strategy</div>
          <div style={{color:DM,fontSize:"13px",marginBottom:"16px"}}>{result?.symbol} · {result?.strategyName}</div>
          <input value={saveName} onChange={e=>setSaveName(e.target.value)}
            placeholder="Give it a name..."
            style={{background:"#0e0e0e",border:`1px solid ${BD}`,borderRadius:"10px",color:TX,padding:"12px 16px",fontSize:"14px",width:"100%",outline:"none",marginBottom:"12px"}}/>
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={saveStrategy} style={{background:A,border:"none",borderRadius:"10px",color:"#000",padding:"12px",fontWeight:"700",flex:1,cursor:"pointer",fontSize:"14px"}}>Save</button>
            <button onClick={()=>setShowSaveModal(false)} style={{background:"transparent",border:`1px solid ${BD}`,borderRadius:"10px",color:DM,padding:"12px",flex:1,cursor:"pointer",fontSize:"14px"}}>Cancel</button>
          </div>
        </div>
      </div>
    )}

    {/* ALERT MODAL */}
    {showAlertModal&&(
      <div className="modal-overlay" onClick={()=>setShowAlertModal(false)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div style={{fontWeight:"700",fontSize:"17px",color:"#fff",marginBottom:"16px"}}>Set Alert</div>
          <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"16px"}}>
            <div>
              <div style={{color:DM,fontSize:"10px",marginBottom:"4px",fontFamily:"'DM Mono',monospace"}}>SYMBOL</div>
              <input value={alertForm.symbol} onChange={e=>setAlertForm(p=>({...p,symbol:e.target.value.toUpperCase()}))}
                placeholder="AAPL"
                style={{background:"#0e0e0e",border:`1px solid ${BD}`,borderRadius:"8px",color:TX,padding:"10px 14px",fontSize:"14px",width:"100%",outline:"none"}}/>
            </div>
            <div>
              <div style={{color:DM,fontSize:"10px",marginBottom:"6px",fontFamily:"'DM Mono',monospace"}}>CONDITION</div>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {[{id:"buy_signal",l:"Buy Signal"},{id:"sell_signal",l:"Sell Signal"},{id:"price_above",l:"Price Above"},{id:"price_below",l:"Price Below"}].map(c=>(
                  <button key={c.id} className={`pill${alertForm.condition===c.id?" active":""}`} onClick={()=>setAlertForm(p=>({...p,condition:c.id}))}>{c.l}</button>
                ))}
              </div>
            </div>
            {(alertForm.condition==="price_above"||alertForm.condition==="price_below")&&(
              <div>
                <div style={{color:DM,fontSize:"10px",marginBottom:"4px",fontFamily:"'DM Mono',monospace"}}>PRICE THRESHOLD ($)</div>
                <input type="number" value={alertForm.threshold} onChange={e=>setAlertForm(p=>({...p,threshold:e.target.value}))}
                  placeholder="0.00"
                  style={{background:"#0e0e0e",border:`1px solid ${BD}`,borderRadius:"8px",color:TX,padding:"10px 14px",fontSize:"14px",width:"100%",outline:"none"}}/>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={createAlert} style={{background:A,border:"none",borderRadius:"10px",color:"#000",padding:"12px",fontWeight:"700",flex:1,cursor:"pointer",fontSize:"14px"}}>Create Alert</button>
            <button onClick={()=>setShowAlertModal(false)} style={{background:"transparent",border:`1px solid ${BD}`,borderRadius:"10px",color:DM,padding:"12px",flex:1,cursor:"pointer",fontSize:"14px"}}>Cancel</button>
          </div>
        </div>
      </div>
    )}
  </div>);
}
