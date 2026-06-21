#!/usr/bin/env python3
# Generates mockup PNGs of the Feynman Education app screens using the real palette.
import cairosvg, os

W, H, SB, TOP = 1280, 760, 240, 34
BG="#f3eee2"; SURF="#faf6ec"; BORDER="#dcd5c0"; RULE="#d8d1bd"; RULES="#a8a191"
TEXT="#1a1714"; MUTED="#4d4940"; DIM="#8c8678"; FAINT="#b8b1a0"
GRN="#5e7c4b"; RED="#b95a3c"; AMB="#a06520"; BLU="#2e3a5f"; PUR="#6b4f7a"
ACCENT="#1a1714"; ACCFG="#f3eee2"
SERIF="Instrument Serif, Georgia, serif"; MONO="IBM Plex Mono, monospace"; SANS="IBM Plex Sans, Helvetica, sans-serif"
CX = SB + 36
CW = W - CX - 44

def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def t(x,y,s,size=13,fill=TEXT,font=SANS,w=400,anchor="start",ls=0,italic=False):
    st=f' font-style="italic"' if italic else ""
    lst=f' letter-spacing="{ls}"' if ls else ""
    return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" font-weight="{w}" text-anchor="{anchor}"{lst}{st}>{esc(s)}</text>'
def rect(x,y,w,h,fill=SURF,stroke=None,rx=8,op=1):
    s=f' stroke="{stroke}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{s} opacity="{op}"/>'
def heat(p): return RED if p<40 else (AMB if p<65 else GRN)
def bar(x,y,w,p,h=8):
    return rect(x,y,w,h,BG,rx=4)+rect(x,y,max(2,w*p/100),h,heat(p),rx=4,op=.8)

def chrome(url):
    s=rect(0,0,W,TOP,"#e7e0d0",rx=0)
    for i,c in enumerate(["#d98b7a","#d9c07a","#9bbf8a"]): s+=f'<circle cx="{20+i*16}" cy="{TOP//2}" r="5" fill="{c}"/>'
    s+=rect(80,TOP//2-9,W-160,18,BG,rx=9)+t(94,TOP//2+4,url,10,DIM,MONO)
    return s

NAV=["This week","Curriculum","Slides","Parents","Assess","School","Trust","Account"]
def sidebar(active):
    s=rect(0,TOP,SB,H-TOP,SURF,rx=0)+f'<line x1="{SB}" y1="{TOP}" x2="{SB}" y2="{H}" stroke="{BORDER}"/>'
    s+=t(24,TOP+32,"FEYNMAN EDUCATION",9,DIM,MONO,ls="2.5")
    s+=f'<text x="24" y="{TOP+62}" font-family="{SERIF}" font-size="26" fill="{TEXT}">Feyn<tspan fill="{GRN}" font-style="italic">man</tspan></text>'
    y=TOP+86; s+=rect(14,y,SB-28,34,BG,BORDER,6)+t(30,y+22,"Search",12,DIM,MONO)+t(SB-30,y+22,"⌘K",10,DIM,MONO,anchor="end")
    ny=y+58
    for it in NAV:
        a=it==active
        if a: s+=rect(0,ny-16,SB,30,BG,rx=0)+rect(0,ny-16,2,30,ACCENT,rx=0)
        s+=t(20,ny+4,it,12,TEXT if a else MUTED,MONO,600 if a else 500); ny+=33
    s+=f'<line x1="0" y1="{H-58}" x2="{SB}" y2="{H-58}" stroke="{BORDER}"/>'
    s+=f'<circle cx="34" cy="{H-29}" r="14" fill="{BG}" stroke="{BORDER}"/>'+t(34,H-24,"A",11,MUTED,MONO,anchor="middle")
    s+=t(58,H-33,"A. Houchell",12,TEXT,SANS,500)+t(58,H-17,"slt",10,DIM,MONO)
    return s

def label(y,s): return t(CX,y,s,10,DIM,MONO,ls="2.6")+f'<line x1="{CX-12}" y1="{y-4}" x2="{CX-2}" y2="{y-4}" stroke="{DIM}"/>'
def sec(y,s): return f'<line x1="{CX}" y1="{y-4}" x2="{CX+24}" y2="{y-4}" stroke="{RULES}"/>'+t(CX+32,y,s,10,DIM,MONO,500,ls="2.2")+f'<line x1="{CX+32+len(s)*7}" y1="{y-4}" x2="{W-44}" y2="{y-4}" stroke="{RULE}"/>'
def h1(y,parts): # parts: list of (txt,color,italic)
    x=CX; out=""
    for txt,col,it in parts:
        out+=t(x,y,txt,40,col,SERIF,400,italic=it); x+=len(txt)*19
    return out

def frame(content, active=None, url="app.feynman.education", app=True):
    body=chrome(url)+(sidebar(active) if app else rect(0,TOP,W,H-TOP,BG,rx=0))+content
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{rect(0,0,W,H,BG,rx=0)}{body}</svg>'

# ---------------- Screens ----------------
def home():
    c=label(TOP+50,"THIS WEEK · 2026-27")
    c+=h1(TOP+96,[("Next: ",TEXT,False),("Photosynthesis",GRN,True)])
    c+=t(CX,TOP+122,"Your next lesson — tap to open.",13,MUTED)
    # next card
    y=TOP+140; c+=rect(CX,y,CW,86,SURF,BORDER)+rect(CX,y,3,86,GRN,rx=0)
    c+=t(CX+24,y+26,"MONDAY, 16 JUN · P3 · LAB 4",10,GRN,MONO,600,ls="1.5")
    c+=t(CX+24,y+56,"10A / Bi1",26,TEXT,SERIF)+t(CX+24,y+76,"Photosynthesis — limiting factors",13,MUTED)
    c+=t(CX+CW-24,y+50,"→",22,GRN,SANS,anchor="end")
    # week
    yy=y+118; c+=sec(yy,"WEEK OF 16 JUNE")
    days=[("MON","16",["10A/Bi1 · Photosynthesis","8X/Sc2 · Forces"]),("TUE","17",["9C/Ch · Acids & alkalis"]),
          ("WED","18",["10A/Bi1 · Required practical","7Y/Sc · Cells"]),("THU","19",[]),("FRI","20",["11B/Ph · Electricity (revision)"])]
    ry=yy+16; c+=rect(CX,ry,CW,250,SURF,BORDER)
    for i,(d,n,ls) in enumerate(days):
        ty=ry+i*50
        if i: c+=f'<line x1="{CX}" y1="{ty}" x2="{CX+CW}" y2="{ty}" stroke="{RULE}"/>'
        c+=t(CX+18,ty+28,d,10,DIM,MONO,600,ls="1.5")+t(CX+18,ty+46,n,20,MUTED,SERIF)
        c+=f'<line x1="{CX+84}" y1="{ty}" x2="{CX+84}" y2="{ty+50}" stroke="{RULE}"/>'
        for j,ls_ in enumerate(ls):
            col=[GRN,BLU,RED][j%3]; c+=rect(CX+98,ty+12+j*0,0,0)  # noop
            c+=rect(CX+98,ty+10+j*20,260,17,"#5e7c4b14" if j==0 else "transparent",rx=4)
            c+=t(CX+106,ty+23+j*20,ls_,12,TEXT)
        if not ls: c+=t(CX+106,ty+30,"—",12,FAINT,MONO,italic=True)
    return frame(c,"This week","app.feynman.education")

def school():
    c=label(TOP+50,"OAKWOOD HIGH · LEADERSHIP")
    c+=h1(TOP+96,[("Where the cohort is ",TEXT,False),("weakest",RED,True),(".",TEXT,False)])
    c+=t(CX,TOP+122,"Aggregated across every class — to target support, not rank teachers. 24 classes.",13,MUTED)
    # trend card
    y=TOP+142; c+=rect(CX,y,CW,70,SURF,BORDER)
    c+=t(CX+18,y+24,"SCHOOL AVERAGE · TREND",10,DIM,MONO,ls="1.4")
    c+=t(CX+18,y+54,"58%",26,GRN,SERIF)+t(CX+72,y+54,"▲ 6 pts",12,GRN,MONO)
    pts=[50,52,51,54,56,55,58]; sx=CX+260; sw=220
    path="".join((("M" if i==0 else "L")+f"{sx+i/(len(pts)-1)*sw:.0f},{y+58-(p-48)/12*40:.0f} ") for i,p in enumerate(pts))
    c+=f'<path d="{path}" fill="none" stroke="{GRN}" stroke-width="2"/>'
    c+=t(CX+CW-18,y+24,"JOIN CODE",10,DIM,MONO,anchor="end")+t(CX+CW-18,y+50,"7F3K9A",18,TEXT,MONO,600,anchor="end")
    # weakest objectives
    yy=y+96; c+=sec(yy,"WEAKEST OBJECTIVES — COHORT")
    objs=[("Required practical: osmosis",34,7),("Balancing equations",41,9),("Moments & levers",47,6),("Electrolysis half-equations",52,5),("Rates: collision theory",61,8)]
    ry=yy+14; c+=rect(CX,ry,CW,len(objs)*40,SURF,BORDER)
    for i,(o,p,n) in enumerate(objs):
        oy=ry+i*40
        if i: c+=f'<line x1="{CX}" y1="{oy}" x2="{CX+CW}" y2="{oy}" stroke="{RULE}"/>'
        c+=t(CX+18,oy+25,o,14,TEXT)+bar(CX+CW-220,oy+16,120,p)
        c+=t(CX+CW-90,oy+25,f"{p}%",12,heat(p),MONO,600)+t(CX+CW-18,oy+25,f"{n} classes",11,DIM,MONO,anchor="end")
    return frame(c,"School","app.feynman.education/school")

def assess():
    c=t(CX,TOP+44,"← Assessments",11,MUTED,MONO,ls="1")
    c+=t(CX,TOP+82,"Year 10 Mock — Paper 1",30,TEXT,SERIF)
    c+=sec(TOP+118,"MARKS")
    qs=["Q1","Q2","Q3","Q4","Q5","Q6"]; pupils=["Alex C","Bina S","Cara M","Dev P","Esme R"]
    gx=CX+18; gy=TOP+138; cellw=58
    c+=rect(CX,gy-20,CW,len(pupils)*30+44,SURF,BORDER)
    c+=t(gx,gy,"PUPIL",10,DIM,MONO,600)
    for j,q in enumerate(qs): c+=t(gx+150+j*cellw,gy,q,10,DIM,MONO,600,anchor="middle")
    c+=t(gx+150+len(qs)*cellw+10,gy,"%",10,DIM,MONO,600)
    import random; random.seed(3)
    for i,p in enumerate(pupils):
        py=gy+24+i*30; c+=t(gx,py+4,p,12,TEXT)
        tot=0; mx=0
        for j,q in enumerate(qs):
            mxq=[1,2,3,2,4,3][j]; mk=random.randint(0,mxq); tot+=mk; mx+=mxq
            c+=rect(gx+128+j*cellw,py-12,40,22,BG,BORDER,4)+t(gx+148+j*cellw,py+4,str(mk),12,TEXT,MONO,anchor="middle")
        pc=round(tot/mx*100); c+=t(gx+150+len(qs)*cellw+10,py+4,f"{pc}%",12,heat(pc),MONO,600)
    # QLA
    yy=gy+len(pupils)*30+60; c+=sec(yy,"QUESTION-LEVEL ANALYSIS · BY TOPIC")
    topics=[("Cell transport",38),("Enzymes",46),("Photosynthesis",59),("Respiration",71)]
    ry=yy+14; c+=rect(CX,ry,CW,len(topics)*38,SURF,BORDER)
    for i,(tp,p) in enumerate(topics):
        oy=ry+i*38
        if i: c+=f'<line x1="{CX}" y1="{oy}" x2="{CX+CW}" y2="{oy}" stroke="{RULE}"/>'
        c+=t(CX+18,oy+24,tp,14,TEXT)+bar(CX+CW-180,oy+15,110,p)+t(CX+CW-18,oy+24,f"{p}%",12,heat(p),MONO,600,anchor="end")
    return frame(c,"Assess","app.feynman.education/assessments")

def trust():
    c=label(TOP+50,"NORTHSTAR TRUST · TRUST")
    c+=h1(TOP+96,[("Every school, ",TEXT,False),("one",GRN,True),(" picture.",TEXT,False)])
    c+=t(CX,TOP+122,"6 schools on the same mastery graph. Trust average mastery 61%.",13,MUTED)
    yy=TOP+150; c+=sec(yy,"SCHOOLS — BENCHMARKED")
    schools=[("Oakwood High",52,True),("Bridgeford Academy",57,True),("Castle Park",61,False),("Dale Community",64,False),("Elmwood",66,False),("Fenton Grammar",70,False)]
    ry=yy+14; c+=rect(CX,ry,CW,len(schools)*44,SURF,BORDER)
    for i,(s,p,below) in enumerate(schools):
        oy=ry+i*44
        if i: c+=f'<line x1="{CX}" y1="{oy}" x2="{CX+CW}" y2="{oy}" stroke="{RULE}"/>'
        c+=f'<circle cx="{CX+22}" cy="{oy+22}" r="4" fill="{heat(p)}"/>'
        c+=t(CX+38,oy+27,s,14,TEXT,SANS,500)
        if below: c+=rect(CX+38+len(s)*8,oy+15,86,16,"#a0652018",rx=3)+t(CX+44+len(s)*8,oy+27,"BELOW AVG",9,AMB,MONO,600)
        c+=bar(CX+CW-200,oy+18,110,p)+t(CX+CW-72,oy+27,f"{p}%",12,heat(p),MONO,600)
    return frame(c,"Trust","app.feynman.education/trust")

def slides():
    c=t(CX,TOP+54,"Slides",30,TEXT,SERIF)
    c+=t(CX+CW,TOP+50,"✨ Generate lesson",12,GRN,MONO,600,anchor="end")
    c+=t(CX+CW-160,TOP+50,"+ New deck",12,MUTED,MONO,anchor="end")
    # deck grid
    gy=TOP+80; cols=4; gw=(CW-30)//cols
    titles=["Photosynthesis","Cell transport","Forces & motion","Acids & alkalis","The heart","Electricity"]
    cols_=[GRN,GRN,BLU,RED,GRN,BLU]
    for i,ti in enumerate(titles):
        gx=CX+(i%cols)*(gw+10); yy=gy+(i//cols)*150
        c+=rect(gx,yy,gw,128,SURF,BORDER)
        c+=rect(gx,yy,gw,86,"#ffffff",BORDER,rx=8)+rect(gx,yy+78,gw,8,SURF,rx=0)
        c+=rect(gx+10,yy+14,3,40,cols_[i],rx=0)+t(gx+20,yy+30,ti,12,TEXT,SERIF)
        c+=t(gx+20,yy+50,"KS4 · 12 slides",8,DIM,MONO)
        c+=t(gx+12,yy+110,ti,12,TEXT)
    # modal overlay
    c+=rect(SB,TOP,W-SB,H-TOP,"#1a1714",rx=0,op=.45)
    mw=460; mx=SB+(W-SB-mw)//2; my=TOP+140
    c+=rect(mx,my,mw,300,SURF,BORDER,12)
    c+=t(mx+26,my+44,"Generate a lesson",26,TEXT,SERIF)
    c+=t(mx+26,my+70,"Pick a unit and AI drafts a full, ready-to-teach deck.",12,MUTED)
    c+=t(mx+26,my+104,"UNIT",10,DIM,MONO,ls="1.2")+rect(mx+26,my+114,mw-52,38,BG,BORDER,6)+t(mx+40,my+138,"Y10 · Photosynthesis",13,TEXT,MONO)
    c+=t(mx+26,my+178,"FOCUS (OPTIONAL)",10,DIM,MONO,ls="1.2")+rect(mx+26,my+188,mw-52,38,BG,BORDER,6)+t(mx+40,my+212,"exam technique on the required practical",12,DIM,MONO)
    c+=rect(mx+mw-160,my+250,134,38,ACCENT,rx=6)+t(mx+mw-93,my+274,"✨ Generate",13,ACCFG,MONO,600,anchor="middle")
    return frame(c,"Slides","app.feynman.education/slides")

def parent():
    # public portal, no app sidebar
    cw=560; cx=(W-cw)//2; y=TOP+40
    c=t(cx,y+16,"FEYNMAN · PARENT",11,DIM,MONO,ls="2")
    c+=t(cx,y+50,"Hello, Sam Carter",30,TEXT,SERIF)
    c+=t(cx,y+74,"Weekly progress and a few minutes of the right practice.",14,MUTED)
    cardy=y+96; c+=rect(cx,cardy,cw,360,"#ffffff",BORDER,12)
    c+=t(cx+24,cardy+34,"Alex Carter",22,TEXT,SERIF)+t(cx+150,cardy+34,"10A / Bi1",13,DIM)
    c+=rect(cx+24,cardy+50,200,38,GRN,rx=8)+t(cx+124,cardy+74,"Practise with Alex →",13,"#fff",SANS,600,anchor="middle")
    # home block
    hy=cardy+104; c+=rect(cx+24,hy,cw-48,180,"#f7f5ef",BORDER,10)
    c+=t(cx+40,hy+26,"Home practice",14,TEXT,SANS,700)
    c+=t(cx+cw-150,hy+26,"Target grade",12,MUTED)+rect(cx+cw-66,hy+12,42,22,"#fff",BORDER,6)+t(cx+cw-45,hy+27,"7",13,TEXT,SANS,anchor="middle")
    c+=t(cx+40,hy+50,"Recent practice: ",12,MUTED)+t(cx+150,hy+50,"62%",12,GRN,MONO,700)+t(cx+185,hy+50,"· working toward grade 7",12,DIM)
    c+=t(cx+40,hy+74,"Focus on these tonight:",12,DIM)
    foc=[("Required practical: osmosis",34),("Active transport",48),("Cell division",58)]
    for i,(f,p) in enumerate(foc):
        ly=hy+92+i*28; c+=f'<line x1="{cx+40}" y1="{ly-8}" x2="{cx+cw-40}" y2="{ly-8}" stroke="{BORDER}"/>'
        c+=t(cx+40,ly+6,f,13,TEXT)+t(cx+cw-150,ly+6,f"{p}%",12,heat(p),MONO)+t(cx+cw-40,ly+6,"Practise →",12,GRN,SANS,anchor="end")
    # report tabs
    ry=hy+196; c+=t(cx+24,ry,"Week of 16 June",12,"#fff",SANS,anchor="start")
    c+=rect(cx+24,ry-14,120,22,ACCENT,rx=11)+t(cx+84,ry+1,"Week of 16 June",11,ACCFG,SANS,anchor="middle")
    c+=rect(cx+152,ry-14,120,22,"#fff",BORDER,11)+t(cx+212,ry+1,"Week of 9 June",11,MUTED,SANS,anchor="middle")
    c+=t(cx,cardy+390,"Reports reflect Alex's class lessons and practice.",11,DIM,SANS,anchor="start")
    return frame(c,None,"feynman.education/parent?t=…",app=False)

OUT=os.path.dirname(__file__)
screens={"01-home-this-week":home,"02-school-dashboard":school,"03-assessments-qla":assess,"04-trust-benchmark":trust,"05-slides-generate":slides,"06-parent-home":parent}
for name,fn in screens.items():
    svg=fn(); open(os.path.join(OUT,name+".svg"),"w").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(),write_to=os.path.join(OUT,name+".png"),output_width=1280)
    print("wrote",name)
