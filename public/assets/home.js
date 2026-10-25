(function(){
  var svg=document.getElementById("tape"), ns="http://www.w3.org/2000/svg";
  var n=78, x0=10, w=980/n, seed=7;
  function rnd(){seed=(seed*16807)%2147483647;return seed/2147483647;}
  var p=120, bars=[];
  for(var i=0;i<n;i++){
    var drift=i<24?-0.35:(i<46?0.9:-0.15);
    var o=p, c=o+(rnd()-0.5)*9+drift*3;
    var h=Math.max(o,c)+rnd()*5, l=Math.min(o,c)-rnd()*5;
    bars.push([o,h,l,c]); p=c;
  }
  var hi=-1e9, lo=1e9;
  bars.forEach(function(b){hi=Math.max(hi,b[1]);lo=Math.min(lo,b[2]);});
  function y(v){return 200-(v-lo)/(hi-lo)*180;}
  function el(t,a){var e=document.createElementNS(ns,t);for(var k in a)e.setAttribute(k,a[k]);return e;}
  svg.appendChild(el("rect",{x:x0+20*w,y:0,width:(52-20)*w,height:220,fill:"var(--zone)"}));
  bars.forEach(function(b,i){
    var up=b[3]>=b[0], col=up?"var(--up)":"var(--down)", cx=x0+i*w+w/2;
    var g=el("g",{"class":"c"}); g.style.animationDelay=(i*12)+"ms";
    g.appendChild(el("line",{x1:cx,x2:cx,y1:y(b[1]),y2:y(b[2]),stroke:col,"stroke-width":1.5}));
    var top=y(Math.max(b[0],b[3])), bh=Math.max(2,Math.abs(y(b[0])-y(b[3])));
    g.appendChild(el("rect",{x:cx-w*0.32,y:top,width:w*0.64,height:bh,rx:1.5,fill:col}));
    svg.appendChild(g);
  });
})();
