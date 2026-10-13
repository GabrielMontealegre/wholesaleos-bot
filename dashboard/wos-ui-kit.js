'use strict';
(function(root){
  function enhance(){
    const theme=document.documentElement.dataset.wosScheme==='light'?'light':'dark';
    for(const node of document.querySelectorAll('.sidebar,.topbar,#wos-approvals')){
      node.classList.add('wos-kit');
      if(node.dataset.bsTheme!==theme)node.dataset.bsTheme=theme;
    }
    document.querySelectorAll('.sidebar .nav-item').forEach(n=>n.classList.add('nav-link'));
    const page=document.getElementById('wos-approvals');if(!page)return;
    if(!page.querySelector('[data-approval-coverage]')){
      const coverage=document.createElement('small');coverage.dataset.approvalCoverage='true';
      coverage.textContent='Other approval queues are not connected.';page.appendChild(coverage);
    }
    page.querySelectorAll('.approval-card').forEach(n=>n.classList.add('card','card-body'));
    page.querySelectorAll('button').forEach(n=>n.classList.add('btn'));
    page.querySelectorAll('.approval-approve').forEach(n=>n.classList.add('btn-outline-success'));
    page.querySelectorAll('.approval-reject').forEach(n=>n.classList.add('btn-outline-danger'));
    page.querySelectorAll('input:not([type=checkbox])').forEach(n=>n.classList.add('form-control'));
    page.querySelectorAll('input[type=checkbox]').forEach(n=>n.classList.add('form-check-input'));
  }
  const observer=new MutationObserver(enhance);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-wos-scheme']});
  observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  root.wosUiKit={version:'1.6.1'};
})(window);
