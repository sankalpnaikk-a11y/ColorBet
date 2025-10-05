import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Volume2, VolumeX, Vibrate, Trash2, RotateCcw, ShieldCheck, Play, Pause, AlertTriangle, History } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const PAYOUTS = { green: 2.0, red: 2.0, violet: 4.0 }
const ROUND_SECONDS = 10
const HISTORY_LIMIT = 50
const CHIPS = [10, 50, 100, 500, 1000]

function useSound(){
  const ctxRef = useRef(null)
  function ensure(){ if(!ctxRef.current){ const AC = window.AudioContext || window.webkitAudioContext; if(AC) ctxRef.current = new AC() } return ctxRef.current }
  function beep({freq=880, duration=200}){ const ctx = ensure(); if(!ctx) return; const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+duration/1000); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+duration/1000+0.05) }
  return { beep }
}

function pseudoHash(seed){ let h = 2166136261>>>0; for(let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) } return ('0000000'+(h>>>0).toString(16)).slice(-8) }

export default function Game(){
  const { beep } = useSound()

  const [balance, setBalance] = useState(()=> Number(localStorage.getItem('cp_balance_v6')||'1000'))
  const [roundId, setRoundId] = useState(()=> Number(localStorage.getItem('cp_roundId_v6')||'202510040500'))
  const [countdown, setCountdown] = useState(ROUND_SECONDS)
  const [isRunning, setIsRunning] = useState(false)

  const [selectedChip, setSelectedChip] = useState(CHIPS[0])
  const [bets, setBets] = useState(()=> JSON.parse(localStorage.getItem('cp_bets_v6')||'[]'))
  const [pools, setPools] = useState({green:0, red:0, violet:0})
  const [history, setHistory] = useState(()=> JSON.parse(localStorage.getItem('cp_history_v6')||'[]'))
  const [txs, setTxs] = useState(()=> JSON.parse(localStorage.getItem('cp_txs_v6')||'[]')) // transaction log

  const [soundOn, setSoundOn] = useState(()=> localStorage.getItem('cp_sound_v6')!=='off')
  const [vibrateOn, setVibrateOn] = useState(()=> localStorage.getItem('cp_vibe_v6')!=='off')

  const [seed, setSeed] = useState(()=> localStorage.getItem('cp_seed_v6') || (Date.now()+'-'+Math.random().toString(36).slice(2)))
  const [resultToast, setResultToast] = useState(null)
  const [winnerHighlight, setWinnerHighlight] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [warnEmpty, setWarnEmpty] = useState(false)
  const [centerBanner, setCenterBanner] = useState(null) // 'WINNER' | 'LOST' | null

  const payoutMode = 'profit' // keep profit-only by default in v6

  useEffect(()=> localStorage.setItem('cp_balance_v6', String(balance)), [balance])
  useEffect(()=> localStorage.setItem('cp_roundId_v6', String(roundId)), [roundId])
  useEffect(()=> localStorage.setItem('cp_bets_v6', JSON.stringify(bets)), [bets])
  useEffect(()=> localStorage.setItem('cp_history_v6', JSON.stringify(history)), [history])
  useEffect(()=> localStorage.setItem('cp_txs_v6', JSON.stringify(txs)), [txs])
  useEffect(()=> localStorage.setItem('cp_sound_v6', soundOn?'on':'off'), [soundOn])
  useEffect(()=> localStorage.setItem('cp_vibe_v6', vibrateOn?'on':'off'), [vibrateOn])
  useEffect(()=> localStorage.setItem('cp_seed_v6', seed), [seed])

  useEffect(()=>{ const p={green:0,red:0,violet:0}; bets.forEach(b=> p[b.color]+=b.amount); setPools(p) },[bets])

  useEffect(()=>{
    if(!isRunning) return
    const t = setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){
          clearInterval(t)
          resolveRound()
          return ROUND_SECONDS
        }
        return c-1
      })
    },1000)
    return ()=> clearInterval(t)
  },[isRunning])

  function haptic(pattern=[12]){
    if(vibrateOn && typeof navigator!=='undefined' && navigator.vibrate){
      navigator.vibrate(pattern)
    }
  }

  const totalStake = useMemo(()=> bets.reduce((a,b)=>a+b.amount,0), [bets])

  function addBet(color){
    const amount = selectedChip
    if(amount > balance){ alert('Not enough balance. Please refill.'); setWarnEmpty(balance<=0); haptic([60]); return }
    setBalance(x=> x - amount)
    setBets(arr=> [...arr, { color, amount }])
    setTxs(t => [{ t: Date.now(), type:'bet', color, amount, balAfter: (balance-amount) }, ...t].slice(0, 300))
    if(soundOn) beep({ freq: 720, duration: 120 })
    haptic([15]) // vibrate on click
  }

  function removeBet(idx){
    const b=bets[idx]; if(!b) return
    setBalance(x=> x + b.amount)
    setBets(arr=> arr.filter((_,i)=> i!==idx))
    setTxs(t => [{ t: Date.now(), type:'refund', color:b.color, amount:b.amount, balAfter: (balance + b.amount) }, ...t].slice(0, 300))
    haptic([10])
  }

  function pseudoPickWinner(){
    const str = seed + '-' + roundId
    let h = 2166136261>>>0
    for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    const r = (h % 1000) / 1000
    if (r < 0.4) return 'green'
    if (r < 0.8) return 'red'
    return 'violet'
  }

  function newSeed(){ setSeed(Date.now()+'-'+Math.random().toString(36).slice(2)); haptic([8]) }

  function resolveRound(){
    const winner = pseudoPickWinner()
    setWinnerHighlight(winner)
    let creditBack=0; const detail=[]
    for(const b of bets){
      if(b.color===winner){
        const profit = b.amount * (PAYOUTS[winner]-1) // profit-only
        creditBack += profit
        detail.push({ ...b, result:'win', profit })
      } else {
        detail.push({ ...b, result:'lose', loss:b.amount })
      }
    }
    if(creditBack>0){
      setBalance(x=> x + creditBack)
      setTxs(t => [{ t: Date.now(), type:'payout', winner, amount: creditBack, balAfter: (balance + creditBack) }, ...t].slice(0, 300))
    } else {
      setTxs(t => [{ t: Date.now(), type:'loss', winner, loss: totalStake, balAfter: (balance) }, ...t].slice(0, 300))
    }
    const net = creditBack - totalStake
    const entry = { id: roundId, winner, net, time: Date.now(), detail }
    setHistory(h=> [entry, ...h].slice(0, HISTORY_LIMIT))
    setResultToast({ winner, net })

    if(net>0){
      setCelebration('win')
      setCenterBanner('WINNER')
      if(soundOn) beep({freq:1100,duration:260})
      haptic([0,30,40,30])
    }else if(net<0){
      setCelebration('lose')
      setCenterBanner('LOST')
      if(soundOn) beep({freq:220,duration:260})
      haptic([120])
    }else{
      setCenterBanner(null)
      if(soundOn) beep({freq:440,duration:150})
      haptic([8])
    }
    setTimeout(()=> setCelebration(null), 2000)
    setTimeout(()=> setCenterBanner(null), 1400)

    setIsRunning(false)
    setTimeout(()=> setWinnerHighlight(null), 1600)
    setBets([])
    setRoundId(r=> r+1)

    setWarnEmpty((w)=> (balance + creditBack - totalStake) <= 0)
  }

  function start(){ if(balance<=0){ setWarnEmpty(true); haptic([80]); return } setIsRunning(true); haptic([12]) }
  function pause(){ setIsRunning(false); haptic([8]) }
  function refill(amount=1000){ setBalance(x=> x + amount); setWarnEmpty(false); setTxs(t => [{ t: Date.now(), type:'refill', amount, balAfter: (balance + amount) }, ...t].slice(0, 300)); haptic([10,20,10]) }
  function resetAll(){ if(!confirm('Reset everything?')) return; setBalance(1000); setBets([]); setHistory([]); setTxs([]); setRoundId(202510040500); haptic([10]) }

  const fmt = n=> Number(n).toLocaleString()
  const seedHash = pseudoHash(seed + '-' + roundId)
  const progress = (ROUND_SECONDS - countdown) / ROUND_SECONDS * 100

  // transactions renderer
  function txLabel(tx){
    const dt = new Date(tx.t)
    const time = dt.toLocaleTimeString()
    switch(tx.type){
      case 'bet': return `Bet ${tx.amount} on ${tx.color} @ ${time}`
      case 'refund': return `Refund ${tx.amount} (${tx.color}) @ ${time}`
      case 'payout': return `Payout +${tx.amount} (winner ${tx.winner}) @ ${time}`
      case 'loss': return `Lost -${tx.loss} (winner ${tx.winner}) @ ${time}`
      case 'refill': return `Refill +${tx.amount} @ ${time}`
      default: return `${tx.type} @ ${time}`
    }
  }

  return (
    <div className="min-h-screen bg-[#0d2b4c] text-white/95 flex items-center justify-center p-5 relative overflow-hidden">
      {/* Center WINNER/LOST banner */}
      <AnimatePresence>
        {centerBanner && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className={`px-10 py-3 rounded-3xl text-5xl font-extrabold animate-popShow ${centerBanner==='WINNER'?'bg-green-600':'bg-red-600'}`}>
              {centerBanner}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* celebrations */}
      <AnimatePresence>
        {celebration==='win' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="pointer-events-none absolute inset-0 flex items-start justify-center">
            <div className="mt-10 relative w-full h-0">
              {Array.from({length:40}).map((_,i)=> (
                <div key={i} className="absolute animate-confettiFall" style={{left: (Math.random()*100)+'%', top: '-5vh'}}>
                  <div style={{width: 6+Math.random()*8, height: 6+Math.random()*8, background: 'linear-gradient(135deg,#ffd700,#ff6b6b,#1e90ff)', borderRadius: 2}} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {celebration==='lose' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-red-500/20 animate-flashRed" />
            <div className="relative w-full h-full">
              {Array.from({length:28}).map((_,i)=> (
                <div key={i} className="absolute animate-rainFall" style={{left: (Math.random()*100)+'%', top: '-5vh'}}>
                  <div style={{width: 2+Math.random()*3, height: 8+Math.random()*24, background: 'rgba(255,255,255,0.35)', borderRadius: 2}} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-3xl p-4 shadow-ios-card" style={{background:'linear-gradient(180deg,#12375f 0%, #0d2b4c 100%)'}}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] text-white/60">Period</div>
              <div className="font-mono text-sm font-semibold">{roundId}</div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-white/70" />
              <div className="text-[11px] text-white/70">Seed</div>
              <div className="font-mono text-xs">{seedHash}</div>
              <button onClick={()=> newSeed()} title="New seed" className="ml-2 text-white/70 hover:text-white"><RotateCcw size={16}/></button>
            </div>
          </div>

          {/* Controls row */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-white/80" />
                <div className="text-xl font-extrabold">{String(countdown).padStart(2,'0')}s</div>
              </div>
              <div className="flex items-center gap-2">
                {!isRunning ? (
                  <button onClick={()=> start()} className={`py-2 px-3 rounded-xl ${balance>0?'bg-[#1e90ff] hover:opacity-95 active:scale-95':'bg-white/20 opacity-60 cursor-not-allowed'} transition btn-shiny animate-shimmer flex items-center gap-1`}>
                    <Play size={16}/> Start
                  </button>
                ) : (
                  <button onClick={()=> pause()} className="py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition flex items-center gap-1">
                    <Pause size={16}/> Pause
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#1e90ff]" style={{width: `${progress}%`}} />
            </div>
          </div>

          {/* Wallet & refill */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] text-white/60">Wallet</div>
              <div className="text-lg font-semibold">{fmt(balance)} coins</div>
              <div className="text-[11px] text-white/60">Staked: {fmt(bets.reduce((a,b)=>a+b.amount,0))}</div>
            </div>
            <div className="text-right">
              <button onClick={()=> refill(1000)} className="py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-sm">Refill +1000</button>
            </div>
          </div>

          {warnEmpty && (
            <div className="mb-3 rounded-xl bg-red-500/20 text-red-100 border border-red-400/30 p-2 text-sm flex items-center gap-2">
              <AlertTriangle size={16}/> Balance is 0. Refill to continue.
            </div>
          )}

          {/* Pools */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className={`rounded-xl p-3 bg-gradient-to-br from-green-500 to-green-600 text-white ${winnerHighlight==='green'?'animate-glow':''}`}>
              <div className="text-xs/relaxed opacity-85">Green Pool</div>
              <div className="text-sm font-semibold">{fmt(pools.green)}</div>
              <div className="text-[11px]">Payout {PAYOUTS.green}x</div>
            </div>
            <div className={`rounded-xl p-3 bg-gradient-to-br from-violet-500 to-violet-700 text-white ${winnerHighlight==='violet'?'animate-glow':''}`}>
              <div className="text-xs opacity-85">Violet Pool</div>
              <div className="text-sm font-semibold">{fmt(pools.violet)}</div>
              <div className="text-[11px]">Payout {PAYOUTS.violet}x</div>
            </div>
            <div className={`rounded-xl p-3 bg-gradient-to-br from-red-500 to-red-600 text-white ${winnerHighlight==='red'?'animate-glow':''}`}>
              <div className="text-xs opacity-85">Red Pool</div>
              <div className="text-sm font-semibold">{fmt(pools.red)}</div>
              <div className="text-[11px]">Payout {PAYOUTS.red}x</div>
            </div>
          </div>

          {/* Chips */}
          <div className="flex items-center gap-2 mb-3">
            {CHIPS.map(c=> (
              <button key={c} onClick={()=> { setSelectedChip(c); haptic([8]) }} className={`flex-1 py-2 rounded-xl transition ${selectedChip===c?'bg-[#1e90ff] text-white btn-shiny animate-shimmer':'bg-white/10 text-white'}`}>{c}</button>
            ))}
          </div>

          {/* Join */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <motion.button whileTap={{scale:0.97}} onClick={()=> addBet('green')} disabled={balance<=0} className={`rounded-xl py-3 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-md ${balance<=0?'opacity-50 cursor-not-allowed':''}`}>Join Green</motion.button>
            <motion.button whileTap={{scale:0.97}} onClick={()=> addBet('violet')} disabled={balance<=0} className={`rounded-xl py-3 bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md ${balance<=0?'opacity-50 cursor-not-allowed':''}`}>Join Violet</motion.button>
            <motion.button whileTap={{scale:0.97}} onClick={()=> addBet('red')} disabled={balance<=0} className={`rounded-xl py-3 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md ${balance<=0?'opacity-50 cursor-not-allowed':''}`}>Join Red</motion.button>
          </div>

          {/* Bets list */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Your Bets</div>
              <div className="text-[11px] text-white/70">{bets.length} placed</div>
            </div>
            <div className="flex flex-col gap-2">
              {bets.length===0 && <div className="text-xs text-white/60">No bets yet</div>}
              {bets.map((b,idx)=>(
                <div key={idx} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${b.color==='green'?'bg-green-400':b.color==='red'?'bg-red-400':'bg-violet-400'}`} />
                    <div className="text-sm capitalize">{b.color}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">{fmt(b.amount)}</div>
                    <button onClick={()=> removeBet(idx)} className="text-white/60 hover:text-white"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fast Record */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Fast Record</div>
              <div className="text-[11px] text-white/70">last {history.length}</div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {history.length===0 && <div className="text-xs text-white/60">No rounds yet</div>}
              {history.map(h => (
                <div key={h.id} className="flex flex-col items-center text-[11px]">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md ${h.winner==='green'?'bg-green-500':h.winner==='red'?'bg-red-500':'bg-violet-600'}`}>{String(h.id).slice(-2)}</div>
                  <div className={`${h.net>0?'text-green-300':h.net<0?'text-red-300':'text-white/70'}`}>{h.net>0?'+':''}{h.net}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction History (detailed) */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <History size={16} className="text-white/80"/>
              <div className="text-sm font-semibold">Transactions</div>
              <div className="text-[11px] text-white/70 ml-auto">{txs.length}</div>
            </div>
            <div className="max-h-48 overflow-auto pr-1 space-y-2">
              {txs.length===0 && <div className="text-xs text-white/60">No transactions yet</div>}
              {txs.map((tx, i)=> (
                <div key={i} className="bg-white/10 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                  <div>{txLabel(tx)}</div>
                  <div className="opacity-80 ml-2 whitespace-nowrap">bal {fmt(tx.balAfter||balance)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 text-[11px] text-white/70">Demo only — play money. Profit-only payout mode.</div>
        </div>
      </div>
    </div>
  )
}
