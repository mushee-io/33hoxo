const bgVideo=document.querySelector<HTMLVideoElement>("#bg-video");
const menu=document.querySelector<HTMLElement>("#menu");
const openButton=document.querySelector<HTMLButtonElement>("#menu-open");
const closeButton=document.querySelector<HTMLButtonElement>("#menu-close");
const backdrop=document.querySelector<HTMLElement>("#menu-backdrop");
const networkLabel=document.querySelector<HTMLElement>("#network-label");
const runtimeLabel=document.querySelector<HTMLElement>("#menu-runtime");
if(!menu||!openButton||!closeButton||!backdrop)throw new Error("33HOXO homepage navigation is missing.");
function setMenu(open:boolean){
  menu.classList.toggle("is-open",open);
  menu.setAttribute("aria-hidden",String(!open));
  openButton.setAttribute("aria-expanded",String(open));
  if(open)closeButton.focus({preventScroll:true});else openButton.focus({preventScroll:true});
}
openButton.addEventListener("click",()=>setMenu(true));
closeButton.addEventListener("click",()=>setMenu(false));
backdrop.addEventListener("click",()=>setMenu(false));
menu.querySelectorAll<HTMLAnchorElement>(".menu__link").forEach(link=>link.addEventListener("click",()=>setMenu(false)));
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&menu.classList.contains("is-open"))setMenu(false)});
void(async()=>{
  try{
    const response=await fetch("/api/config",{cache:"no-store"});if(!response.ok)return;
    const config=await response.json() as {shutterNetwork?:string;solanaCluster?:string};
    const shutter=config.shutterNetwork==="gnosis"?"Gnosis":"Chiado";
    const solana=config.solanaCluster==="mainnet-beta"?"Mainnet":"Devnet";
    if(networkLabel)networkLabel.textContent=`${shutter} live`;
    if(runtimeLabel)runtimeLabel.textContent=`Shutter ${shutter} · Solana ${solana}`;
  }catch{}
})();

if(bgVideo){
  const loadVideo=()=>{
    const src=bgVideo.dataset.src;
    if(!src||bgVideo.src)return;
    bgVideo.src=src;
    bgVideo.load();
    void bgVideo.play().catch(()=>{});
  };
  if("requestIdleCallback" in window){
    (window as Window & {requestIdleCallback:(cb:()=>void,opts?:{timeout:number})=>number}).requestIdleCallback(loadVideo,{timeout:1800});
  }else{
    window.setTimeout(loadVideo,700);
  }
}
