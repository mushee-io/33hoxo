const video=document.querySelector<HTMLVideoElement>("#bg-video");
const card=document.querySelector<HTMLElement>("[data-glass-card]");
const container=document.querySelector<HTMLElement>("#dup-video-container");
const canvas=document.querySelector<HTMLCanvasElement>("#dup-image");
if(!video||!card||!container||!canvas)throw new Error("33HOXO liquid-glass elements are missing.");
const ctx=canvas.getContext("2d",{alpha:true});if(!ctx)throw new Error("Canvas 2D context unavailable.");
const DUP_PIXEL_RATIO=1;
function draw(){
  const rect=card.getBoundingClientRect();
  const vw=document.documentElement.clientWidth;
  const vh=document.documentElement.clientHeight;
  if(rect.width>0&&rect.height>0&&video.videoWidth>0&&video.videoHeight>0){
    // Deliberately size the duplicate to the viewport, not the card. The SVG
    // filter's chromatic edge bands stay outside the clipped glass window.
    container.style.left=`${-rect.left}px`;
    container.style.top=`${-rect.top}px`;
    container.style.width=`${vw}px`;
    container.style.height=`${vh}px`;
    // Keep the duplicate at 1x even on retina: the soft refraction does not
    // benefit from multiplying the SVG filter's pixel cost.
    const w=Math.max(1,Math.round(vw*DUP_PIXEL_RATIO));
    const h=Math.max(1,Math.round(vh*DUP_PIXEL_RATIO));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    const cover=Math.max(vw/video.videoWidth,vh/video.videoHeight);
    const sw=vw/cover,sh=vh/cover;
    const sx=(video.videoWidth-sw)/2,sy=(video.videoHeight-sh)/2;
    try{ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h)}catch{}
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
