import { useState, useRef } from "react";

const COLORS = { forex:"#2563eb", crypto:"#7c3aed", equities:"#059669", signals:"#dc2626" };
const LABELS = { forex:"Forex", crypto:"Crypto", equities:"US Equities", signals:"Trade Signals" };
const TABS   = ["forex","crypto","equities","signals"];
const CHIPS  = {
  forex:    ["EURUSD Weekly","USDJPY Trend","GBPUSD Key Levels","DXY Dollar Index","Gold XAUUSD"],
  crypto:   ["Bitcoin Weekly","Ethereum Price Action","Altcoin Season","BTC Dominance","Crypto Sentiment"],
  equities: ["SPY Weekly","QQQ Tech Sector","SP500 Key Levels","Earnings Week","Sector Rotation","Apple AAPL","Microsoft MSFT","NVIDIA NVDA","Amazon AMZN","Tesla TSLA","Meta META","Alphabet GOOGL","Berkshire BRKB","JPMorgan JPM","Broadcom AVGO"],
  signals:  []
};

const SS = "You are a financial content writer for MarketPulse Weekly. Use web_search for REAL current market data. Return ONLY raw JSON with keys: title, data_sources, hook, intro, market_context, key_levels, outlook, outro, poll_question, pinned_comment, community_post. No markdown. No backticks. Pure JSON only.";
const SG = "You are a technical analyst for MarketPulse Weekly. Use web_search for REAL current price data. Return ONLY raw JSON with a signals array containing one object with fields: ticker, name, direction, current_price, entry, stop_loss, take_profit_1, take_profit_2, risk_reward, setup, key_catalyst. Also a disclaimer field. No markdown. No backticks. Pure JSON only.";


function CopyBtn({ getText, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    try {
      const text = getText();
      navigator.clipboard.writeText(text).then(function() {
        setCopied(true);
        setTimeout(function() { setCopied(false); }, 2000);
      }).catch(function() {
        fallbackCopy(text);
      });
    } catch(e) {
      console.log(e);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(function() { setCopied(false); }, 2000);
  }
  return (
    <button onClick={handleCopy} style={{ padding:"4px 11px", borderRadius:6, border:"1px solid #e5e7eb", background:"#f9fafb", fontSize:12, cursor:"pointer", fontWeight:600, color: copied ? "#059669" : "#6b7280" }}>
      {copied ? "Copied!" : (label || "Copy")}
    </button>
  );
}

async function callAPI(key, sys, msgs) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type":"application/json", "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:4096, system:sys, tools:[{ type:"web_search_20250305", name:"web_search" }], messages:msgs })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

async function runSearch(key, sys, msg, setStep) {
  const d1 = await callAPI(key, sys, [{ role:"user", content:msg }]);
  if (d1.stop_reason !== "tool_use") return d1.content;
  setStep("Analyzing data...");
  const tr = d1.content.filter(b => b.type === "tool_use").map(b => ({ type:"tool_result", tool_use_id:b.id, content:"Done: "+(b.input&&b.input.query?b.input.query:"search") }));
  const d2 = await callAPI(key, sys, [{ role:"user", content:msg }, { role:"assistant", content:d1.content }, { role:"user", content:tr }]);
  return d2.content;
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON found.");
  let s = m[0];
  try { return JSON.parse(s); } catch(e) {
    s = s.replace(/,\s*$/, "");
    const op = (s.match(/\{/g)||[]).length - (s.match(/\}/g)||[]).length;
    const lc = s[s.length-1];
    if (lc !== '"' && lc !== "}") s += '"';
    for (let n = 0; n < op; n++) s += "}";
    return JSON.parse(s);
  }
}

export default function App() {
  const [apiKey, setApiKey]   = useState("");
  const [keySet, setKeySet]   = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [keyErr, setKeyErr]   = useState("");
  const [tab, setTab]         = useState("forex");
  const [topic, setTopic]     = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep]       = useState("");
  const [error, setError]     = useState("");
  const [script, setScript]   = useState(null);
  const [signals, setSignals] = useState([]);
  const [lastDisc, setLastDisc] = useState("");

  const inputRef = useRef(null);

  function switchTab(t) { setTab(t); setTopic(""); setError(""); setScript(null); setSignals([]); }

  function saveKey() {
    if (apiKey.trim().indexOf("sk-") !== 0) { setKeyErr("Enter a valid key starting with sk-"); return; }
    setKeySet(true);
  }

  async function generate() {
    if (!topic.trim()) return;
    const isSig = tab === "signals";
    setError(""); setLoading(true); setStep(isSig ? "Fetching data for "+topic.toUpperCase()+"..." : "Searching market data...");
    const msg = isSig
      ? "Ticker: "+topic.toUpperCase()+". Date: "+new Date().toDateString()+". Find latest price technicals and news. Return signal JSON."
      : "Series: "+LABELS[tab]+". Topic: "+topic+". Date: "+new Date().toDateString()+". Find current market data. Return script JSON.";
    try {
      const content = await runSearch(apiKey, isSig ? SG : SS, msg, setStep);
      setStep("Finalizing...");
      const text = content.filter(b => b.type==="text").map(b => b.text).join("");
      const parsed = parseJSON(text);
      if (isSig) {
        const sig = parsed.signals && parsed.signals[0];
        if (!sig) throw new Error("No signal returned.");
        setSignals(prev => [{ sig, disc: parsed.disclaimer||"" }, ...prev]);
        setLastDisc(parsed.disclaimer||"");
        setTopic("");
        if (inputRef.current) inputRef.current.focus();
      } else {
        setScript(parsed);
      }
    } catch(e) { setError("Error: "+e.message); }
    setLoading(false); setStep("");
  }

  const col = COLORS[tab];

  if (!keySet) return (
    <div style={{ fontFamily:"sans-serif", minHeight:"100vh", background:"#f9fafb", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", padding:32, maxWidth:440, width:"100%" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22 }}>
          <div style={{ background:"#111", color:"#fff", fontWeight:800, fontSize:17, padding:"6px 11px", borderRadius:8 }}>MP</div>
          <div><div style={{ fontWeight:700, fontSize:15 }}>MarketPulse Weekly</div><div style={{ fontSize:12, color:"#6b7280" }}>Live Script and Signal Generator</div></div>
        </div>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:9, padding:"11px 15px", marginBottom:18, fontSize:13, color:"#166534" }}>Live Market Data - powered by real-time web search</div>
        <label style={{ fontSize:14, fontWeight:600, display:"block", marginBottom:5 }}>Enter your Anthropic API Key</label>
        <p style={{ fontSize:13, color:"#6b7280", marginBottom:14 }}>Get yours at <a href="https://console.anthropic.com" target="_blank" style={{ color:"#2563eb" }}>console.anthropic.com</a></p>
        <div style={{ position:"relative", marginBottom:14 }}>
          <input type={showPw?"text":"password"} value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key==="Enter" && saveKey()} placeholder="sk-ant-..."
            style={{ width:"100%", padding:"11px 42px 11px 13px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:14, outline:"none", boxSizing:"border-box" }}/>
          <button onClick={() => setShowPw(!showPw)} style={{ position:"absolute", right:10, top:"50%", marginTop:-9, background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#6b7280" }}>{showPw?"hide":"show"}</button>
        </div>
        <button onClick={saveKey} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background:"#111", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>Continue</button>
        {keyErr && <p style={{ color:"#dc2626", fontSize:13, marginTop:9 }}>{keyErr}</p>}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"sans-serif", minHeight:"100vh", background:"#f9fafb" }}>
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"16px 24px" }}>
        <div style={{ maxWidth:820, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ background:"#111", color:"#fff", fontWeight:800, fontSize:17, padding:"6px 11px", borderRadius:8 }}>MP</div>
            <div><div style={{ fontWeight:700, fontSize:15 }}>MarketPulse Weekly</div><div style={{ fontSize:12, color:"#6b7280" }}>Live Script and Signal Generator</div></div>
          </div>
          <button onClick={() => { setKeySet(false); setApiKey(""); setSignals([]); setScript(null); }} style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb", borderRadius:6, padding:"5px 10px", cursor:"pointer" }}>Change Key</button>
        </div>
      </div>

      <div style={{ maxWidth:820, margin:"0 auto", padding:"28px 24px" }}>
        <div style={{ display:"flex", gap:8, marginBottom:26 }}>
          {TABS.map(k => (
            <button key={k} onClick={() => switchTab(k)} style={{ flex:1, padding:"11px 6px", borderRadius:10, border: k===tab ? "2px solid "+COLORS[k] : "2px solid #e5e7eb", background: k===tab ? COLORS[k]+"18" : "#fff", cursor:"pointer", fontWeight:600, fontSize:13, color: k===tab ? COLORS[k] : "#6b7280" }}>
              <div style={{ fontSize:15, marginBottom:3 }}>
                {k==="forex" ? "FX" : k==="crypto" ? "C" : k==="equities" ? "EQ" : "SG"}
              </div>
              {LABELS[k]}
            </button>
          ))}
        </div>

        {/* Input Card */}
        <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e5e7eb", padding:22, marginBottom:18 }}>
          <label style={{ fontWeight:600, fontSize:14, display:"block", marginBottom:7 }}>
            {tab==="signals" ? "Enter a ticker for a weekly trade signal" : LABELS[tab]+" - What is this week's topic?"}
          </label>
          {tab==="signals" && <p style={{ fontSize:12, color:"#6b7280", marginBottom:10 }}>Type any US stock ticker e.g. AAPL TSLA NVDA SPY</p>}
          <input ref={inputRef} value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key==="Enter" && generate()}
            placeholder={tab==="signals" ? "e.g. NVDA AAPL TSLA SPY" : (CHIPS[tab].length ? "e.g. "+CHIPS[tab][0] : "")}
            style={{ width:"100%", padding:"11px 13px", borderRadius:8, border:"1px solid #e5e7eb", fontSize:14, outline:"none", marginBottom:13, boxSizing:"border-box" }}/>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
            {CHIPS[tab].map(ch => (
              <button key={ch} onClick={() => setTopic(ch)} style={{ padding:"4px 11px", borderRadius:20, border:"1px solid #e5e7eb", background: topic===ch ? col : "#f3f4f6", color: topic===ch ? "#fff" : "#374151", fontSize:12, cursor:"pointer", fontWeight:500 }}>{ch}</button>
            ))}
          </div>
          <button onClick={generate} disabled={loading||!topic.trim()} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background: topic.trim()&&!loading ? col : "#e5e7eb", color:"#fff", fontWeight:700, fontSize:15, cursor: topic.trim()&&!loading ? "pointer" : "not-allowed" }}>
            {loading ? step : tab==="signals" ? "Generate Signal" : "Generate Live Market Script"}
          </button>
        </div>

        {error && <div style={{ padding:14, borderRadius:9, background:"#fef2f2", color:"#dc2626", fontSize:14, marginBottom:18 }}>{error}</div>}
        {tab!=="signals" && script && <ScriptView r={script} col={col} />}
        {tab==="signals" && signals.length > 0 && <SignalsView signals={signals} disc={lastDisc} />}


      </div>
    </div>
  );
}



function ScriptView({ r, col }) {
  const full = [
    r.title||"",
    "HOOK\n"+(r.hook||""),
    "INTRO\n"+(r.intro||""),
    "MARKET CONTEXT\n"+(r.market_context||""),
    "KEY LEVELS\n"+(r.key_levels||""),
    "OUTLOOK\n"+(r.outlook||""),
    "OUTRO\n"+(r.outro||""),
    "POLL: "+(r.poll_question||""),
    "PINNED: "+(r.pinned_comment||""),
    "COMMUNITY: "+(r.community_post||"")
  ].join("\n\n");

  const secs = [["Hook",r.hook],["Intro",r.intro],["Market Context",r.market_context],["Key Levels",r.key_levels],["Weekly Outlook",r.outlook],["Outro and CTA",r.outro]];
  const engs = [["Community Poll",r.poll_question],["Pinned Comment",r.pinned_comment],["Community Post",r.community_post]];

  return (
    <div>
      {r.data_sources && <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:9, padding:"11px 15px", marginBottom:14, fontSize:13, color:"#166534" }}>Live data: {r.data_sources}</div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:15 }}>
        <div style={{ fontSize:17, fontWeight:700 }}>{r.title}</div>
        <CopyBtn getText={() => full} label="Copy All" />
      </div>
      {secs.map(([lbl, txt]) => (
        <div key={lbl} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:18, marginBottom:11 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9 }}>
            <span style={{ fontWeight:700, fontSize:14 }}>{lbl}</span>
            <CopyBtn getText={() => txt||""} />
          </div>
          <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, whiteSpace:"pre-line", margin:0 }}>{txt}</p>
        </div>
      ))}
      <div style={{ borderRadius:12, padding:18, background:col+"10", border:"1px solid "+col+"40" }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:13, color:col }}>Viewer Engagement Boosters</div>
        {engs.map(([lbl, txt]) => (
          <div key={lbl} style={{ marginBottom:13 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>{lbl}</span>
              <CopyBtn getText={() => txt||""} />
            </div>
            <div style={{ fontSize:13, color:"#374151", lineHeight:1.6, background:"#fff", padding:"9px 13px", borderRadius:7 }}>{txt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalsView({ signals, disc }) {
  return (
    <div>
      <div style={{ fontSize:13, color:"#6b7280", fontWeight:600, marginBottom:13 }}>Session signals: {signals.length} - enter another ticker to add more</div>
      {signals.map((item, idx) => {
        const s   = item.sig;
        const dir = (s.direction||"").toUpperCase();
        const bc  = dir==="BUY" ? { bg:"#dcfce7", cl:"#166534" } : dir==="SELL" ? { bg:"#fee2e2", cl:"#991b1b" } : { bg:"#f3f4f6", cl:"#374151" };
        const isLast = idx === 0;
        const copyTxt = [s.ticker+" | "+s.name,"Direction: "+s.direction,"Price: "+s.current_price,"Entry: "+s.entry,"SL: "+s.stop_loss,"TP1: "+s.take_profit_1,"TP2: "+s.take_profit_2,"RR: "+s.risk_reward,"Setup: "+s.setup,"Catalyst: "+s.key_catalyst,"",item.disc].join("\n");
        const rows = [["Current Price",s.current_price,""],["Entry Zone",s.entry,"#2563eb"],["Stop Loss",s.stop_loss,"#dc2626"],["Take Profit 1",s.take_profit_1,"#059669"],["Take Profit 2",s.take_profit_2,"#059669"],["Risk/Reward",s.risk_reward,"#7c3aed"],["Timeframe","Weekly",""]];
        return (
          <div key={idx} style={{ background:"#fff", border: isLast ? "2px solid #dc2626" : "1px solid #e5e7eb", borderRadius:13, padding:18, marginBottom:13 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800 }}>{s.ticker}</div>
                <div style={{ fontSize:12, color:"#6b7280", marginBottom:9 }}>{s.name}</div>
              </div>
              <CopyBtn getText={() => copyTxt} />
            </div>
            <span style={{ display:"inline-block", padding:"3px 11px", borderRadius:20, fontSize:12, fontWeight:700, marginBottom:11, background:bc.bg, color:bc.cl }}>{dir}</span>
            {rows.map(([lbl,val,cl]) => (
              <div key={lbl} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
                <span style={{ color:"#6b7280" }}>{lbl}</span>
                <span style={{ fontWeight:700, color:cl||"#111" }}>{val||"-"}</span>
              </div>
            ))}
            <div style={{ fontSize:12, color:"#374151", marginTop:7, lineHeight:1.5 }}><strong>Setup:</strong> {s.setup}</div>
            <div style={{ fontSize:12, color:"#374151", marginTop:6, lineHeight:1.5 }}><strong>Catalyst:</strong> {s.key_catalyst}</div>
            {isLast && <div style={{ fontSize:11, color:"#dc2626", fontWeight:700, marginTop:7, letterSpacing:1 }}>LATEST</div>}
          </div>
        );
      })}
      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:9, padding:"13px 15px", fontSize:12, color:"#92400e", lineHeight:1.6 }}>
        <strong>Disclaimer:</strong> {disc||"For educational purposes only. Not financial advice."}
      </div>
    </div>
  );
}
