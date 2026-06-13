"use client";
import { useState } from "react";
import { Auth } from "../components/Auth";
import { Student } from "../components/Student";
import { Teacher } from "../components/Teacher";
import { Badge, Btn } from "../components/ui";
import { sb } from "../lib/supabase";
import { C } from "../lib/theme";

export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <Auth onAuth={setUser} />;
  const isT = user.profile?.role === "teacher" || user.profile?.role === "moderator" || user.profile?.role === "hod" || user.user_metadata?.role === "teacher";
  const isMod = user.profile?.role === "moderator";
  const isHoD = user.profile?.role === "hod" || user.profile?.role === "moderator";

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "var(--font-plex), -apple-system, sans-serif", color: C.txt }}>
      <div style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card, padding: "0 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -.5 }}>retrieval<span style={{ color: C.pri }}>.</span></span>
            <Badge color={isMod ? C.pri : (user.profile?.role === "hod" ? C.amb : (isT ? C.acc : C.pri))}>{isMod ? "Moderator" : (user.profile?.role === "hod" ? "Head of Department" : (isT ? "Teacher" : "Student"))}</Badge>
          </div>
          <Btn v="ghost" onClick={() => { sb.auth.out(); setUser(null); }} style={{ padding: "6px 12px", fontSize: 12 }}>Log out</Btn>
        </div>
      </div>
      <div style={{ paddingBottom: 60 }}>{isT ? <Teacher user={user} isMod={isMod} isHoD={isHoD} /> : <Student user={user} />}</div>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};-webkit-font-smoothing:antialiased}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes starPop{0%{opacity:0;transform:scale(0) rotate(-30deg)}20%{opacity:1;transform:scale(1.5) rotate(10deg)}40%{transform:scale(1.2) rotate(-5deg)}60%{transform:scale(1.3) rotate(3deg)}100%{opacity:0;transform:scale(2) translateY(-40px) rotate(15deg)}}
        @keyframes pulseToday{0%,100%{box-shadow:0 0 0 0 ${C.priGlow}}50%{box-shadow:0 0 0 6px transparent}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes milestonePop{0%{opacity:0;transform:scale(0.5)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
        button:active{transform:scale(.98)}
        input:focus,textarea:focus,select:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px ${C.priGlow}}
        button:focus{outline:none}
        button:focus-visible{outline:2px solid ${C.pri};outline-offset:2px}
        ::selection{background:${C.priGlow}}
        select option{background:${C.card};color:${C.txt}}
      `}</style>
    </div>
  );
}
