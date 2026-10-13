'use strict';
(function(root){
  var roles={buyer:['Buyer','#34d399'],seller:['Seller / owner','#60a5fa'],holder:['JV partner','#a78bfa'],partner:['JV partner','#a78bfa'],title:['Title company','#2dd4bf'],attorney:['Attorney','#94a3b8'],lender:['Lender','#fb923c'],agent:['Agent','#fbbf24'],other:['Other','#c1c7d4']};
  root.wosRoleChip=function(role){var value=Object.prototype.hasOwnProperty.call(roles,role)?roles[role]:null;return '<span class="wos-role-chip"'+(value?' data-recorded-role="'+role+'" style="--role-color:'+value[1]+'"':'')+'>'+ (value?value[0]:'Link to a person')+'</span>';};
  root.wosRoleColor=function(role){return Object.prototype.hasOwnProperty.call(roles,role)?roles[role][1]:'#c1c7d4';};
  var style=document.createElement('style');style.textContent='.wos-role-chip{display:inline-flex;gap:5px;align-items:center;font-size:12px;line-height:1.4;color:var(--role-color,#c1c7d4);border:1px solid var(--role-color,#8a93a8);border-radius:4px;padding:2px 6px;white-space:normal}.wos-role-chip:before{content:"";width:6px;height:6px;flex:none;background:var(--role-color,#c1c7d4);border-radius:50%}html[data-wos-scheme=light] .wos-role-chip{color:#182131}';document.head.appendChild(style);
})(window);
