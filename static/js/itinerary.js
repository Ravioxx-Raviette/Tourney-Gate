(() => {
 const button=document.getElementById('print-itinerary');button?.addEventListener('click',()=>window.print());
 const notice=document.querySelector('.planner-feedback');if(notice){notice.tabIndex=-1;notice.focus({preventScroll:true});}
})();
