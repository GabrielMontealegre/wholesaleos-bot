'use strict';
(function (root) {
  var labels = {
    holder_agreed: 'The holder agreed to a JV', teaser_sent: 'I sent the blind teaser', buyer_agreed: 'The buyer agreed at the price recorded below',
    signed: 'The JV agreement is signed', contract_copy_verified: 'I verified the contract copy', seller_signature: 'I reviewed the seller signature',
    assignable: 'I reviewed assignment rights', owner_record_matches: 'The owner record matches the contract', contract_interest: 'I reviewed our contract interest',
    title_pays_fees: 'Title pays fees at closing', non_circumvention: 'Non-circumvention protection is included', non_solicitation: 'Non-solicitation protection is included',
    protection_24_months: 'Those protections last 24 months', disbursement_letter: 'The disbursement letter is included',
    package_sent: 'I sent the full package to this buyer', emd_received: 'Title received the earnest money', assignment_signed: 'The assignment is signed', title_closed: 'Title confirmed closing'
  };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function field(label, key, value, type) { return '<label>' + label + '<input data-jv-field="' + key + '" type="' + (type || 'text') + '" maxlength="2048"' + (type === 'number' ? ' min="0" step="any"' : '') + ' value="' + esc(value) + '"></label>'; }
  function time(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {timeZone:'Etc/GMT+7',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
  }
  function render(deal) {
    var model = deal.jv_workflow;
    if (!model) return '<p>JV stages unavailable. Refresh the card before recording an action.</p>';
    var current = model.stages.find(function (s) { return s.stage === model.next_stage; });
    var buyers = deal.evaluation.matches || [];
    var chosen = model.events.find(function (event) { return event.to === 'buyer_interested'; });
    var terminal = ['closed','dead'].includes(model.stage);
    var disabled = model.history_invalid || terminal || deal.approval !== 'approved' || deal.evaluation.status === 'expired' && model.next_stage !== 'closed';
    var reason = model.history_invalid ? 'Recorded history needs review. No stage can be saved.' : terminal ? 'This deal is closed.' : deal.approval !== 'approved' ? 'Review and approve the deal first.' : deal.evaluation.status === 'expired' ? 'The deadline has passed. Only a real close-out report can be recorded.' : '';
    var selected = buyers.filter(function (b) { return !chosen || b.id === chosen.buyer_id; });
    var options = '<option value="">Choose a matched buyer</option>' + selected.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.buyer_ref || b.name || 'Matched buyer') + '</option>'; }).join('');
    var needsBuyer = ['buyer_teaser','buyer_interested','full_package','emd_at_title','assigned','closed'].includes(model.next_stage);
    var html = '<section class="jvw" data-jv-workspace data-next-disabled="' + disabled + '"><h4>JV progress</h4><ol class="jvw-stages" aria-label="Recorded JV stages">' + model.stages.map(function (s) {
      return '<li' + (s.stage === model.stage ? ' aria-current="step"' : '') + '>' + esc(s.label) + '<small>' + (s.recorded ? 'Recorded' : 'Not recorded') + '</small></li>';
    }).join('') + '</ol><p>Current stage: <strong>' + esc(model.label) + '</strong></p>' + (reason ? '<p class="jvw-caution">' + esc(reason) + '</p>' : '') +
      (model.events.some(function (e) { return e.to === 'jv_signed'; }) && !model.full_package_evidence_ready ? '<p class="jvw-caution">' + esc(model.blocking_reason) + ' Full package remains locked.</p>' : '') +
      '<details><summary>Recorded stage history (' + model.events.length + ')</summary>' + (model.events.length ? model.events.map(function (e) {
        var stage = model.stages.find(function (s) { return s.stage === e.to; });
        return '<p><strong>' + esc(stage ? stage.label : 'Dead') + '</strong> - ' + esc(time(e.happened_at)) + ' - ' + esc(e.operator_id) + '</p><p>' + esc(e.evidence_text) + '</p>' +
          '<p>Operator report recorded ' + esc(time(e.recorded_at)) + ' <a href="' + esc(e.source_url) + '" target="_blank" rel="noopener noreferrer">Open action evidence</a></p>';
      }).join('') : '<p>No JV actions recorded yet. Legacy history is preserved in the activity timeline.</p>') + '</details>';
    html += '<details data-jv-terms><summary>Holder terms</summary><div class="jvw-fields">' +
      field('Contract price ($)', 'contract_price', deal.contract_price, 'number') + field('Holder fee ($)', 'holder_fee', deal.holder_fee, 'number') +
      field("Gabriel's share (%)", 'jv_split', deal.jv_split == null ? '' : deal.jv_split * 100, 'number') +
      field('Closing date (for example October 20, 2026)', 'closing_date', deal.closing_date) + field('Title company', 'title_company', deal.title_company) + field('Earnest money ($)', 'emd', deal.emd, 'number') + '</div>' +
      field('Holder message/document URL', 'terms_source', '') + field('What the holder actually stated', 'terms_evidence', '') +
      '<button type="button" data-jv-command="terms" title="Save only the holder terms you entered with their source">Save holder terms</button><p data-jv-terms-result role="status"></p></details>';
    html += '<div class="jvw-previews"><label>Preview for matched buyer<select data-jv-preview-buyer>' + options + '</select></label><div class="td-actions">' +
      '<button type="button" data-jv-command="buyer-teaser" title="Read a blind teaser; this does not send it">Preview blind teaser</button>' +
      '<button type="button" data-jv-command="full-package" title="Read the full package only after current signed evidence is recorded"' + (!model.full_package_evidence_ready ? ' disabled' : '') + '>Preview full package</button></div><div data-jv-preview-result role="status"></div></div>';
    if (!terminal && !model.history_invalid) {
      html += '<form data-jv-stage-form><h4>Record an action that happened</h4><label>Outcome<select data-jv-stage><option value="' + esc(model.next_stage) + '">' + esc(current ? current.label : 'Next stage') + '</option><option value="dead">Dead - record why</option></select></label>' +
        '<div data-jv-next-fields><fieldset><legend>Required checks</legend>' + ((current && current.required_checks) || []).map(function (key) {
          return '<label><input type="checkbox" data-jv-check="' + esc(key) + '"> ' + esc(labels[key] || key.replace(/_/g,' ')) + '</label>';
        }).join('') + '</fieldset>' + (needsBuyer ? '<label>Buyer who took this action<select data-jv-field="buyer_id">' + options + '</select></label>' : '') +
        (model.next_stage === 'buyer_interested' ? field('Price the buyer agreed to ($)', 'buyer_price', '', 'number') : '') +
        (model.next_stage === 'jv_signed' ? field('Actual signed date (for example October 10, 2026)', 'signed_date_text', '') + field('Verified contract copy URL', 'contract_source_url', '', 'url') + field('Signed JV agreement URL', 'agreement_source_url', '', 'url') : '') + '</div>' +
        field('When it happened (your time, UTC-7)', 'happened_at', '', 'datetime-local') + field('Message/document URL proving the action', 'source_url', '', 'url') +
        field('What actually happened; for Dead, give the reason', 'evidence_text', '') +
        '<p>Nothing changes until you save a real action. A preview does not send a message or complete a stage.</p><button type="submit" title="Record your actual action with its time and evidence"' + (disabled ? ' disabled' : '') + '>Save recorded action</button><p data-jv-stage-result role="status"></p></form>';
    }
    return html + '</section>';
  }
  function get(scope, key) { var el = scope.querySelector('[data-jv-field="' + key + '"]'); return el ? el.value.trim() : ''; }
  function endpoint(workspace, action) { return '/api/dashboard/todays-deals/' + encodeURIComponent(workspace.closest('[data-deal-id]').dataset.dealId) + (action ? '/' + action : ''); }
  var messages = {
    find_deal_jv_checks_required:'Tick every required check only if it is true.', find_deal_jv_transition_invalid:'The stage changed. Refresh the card before recording another action.',
    find_deal_jv_holder_terms_required:'Record the contract price, closing date, title company, split or fee, and earnest money first.',
    find_deal_jv_event_date_invalid:'Enter the actual UTC action time, not a future date.', find_deal_jv_event_stale:'This action is older than the recorded history. Review the timing.',
    find_deal_jv_signed_date_unproven:'Use the actual spelled-out or ISO signing date; an ambiguous numeric date cannot prove signing.',
    find_deal_jv_full_package_locked:'Full package is locked. Current signed evidence, reviewed value and the same matched buyer are required.',
    find_deal_jv_teaser_not_ready:'The deal must be approved, current and eligible for a matched buyer teaser.', find_deal_jv_buyer_not_matched:'Choose a currently matched approved buyer.',
    find_deal_jv_terminal:'This deal is no longer active.', find_deal_date_unproven:'Use a spelled-out or ISO closing date.', find_deal_jv_history_invalid:'The stage history needs review.',
    find_deal_jv_source_invalid:'Use the actual HTTPS source or document URL.'
  };
  function request(url, method, body) {
    return fetch(url, {method:method, headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})}).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (value) {
        if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Please sign in as an admin. Nothing was saved.' : (messages[value.code] || 'Not completed. Review the source, required fields and current card.'));
        return value;
      });
    });
  }
  function saved(workspace) { workspace.dispatchEvent(new CustomEvent('wos-jv-saved',{bubbles:true})); }
  document.addEventListener('change', function (event) {
    if (!event.target.matches('[data-jv-stage]')) return;
    var form = event.target.closest('form'); var dead = event.target.value === 'dead';
    form.querySelector('[data-jv-next-fields]').hidden = dead;
    form.querySelector('button[type="submit"]').disabled = !dead && form.closest('[data-jv-workspace]').dataset.nextDisabled === 'true';
  });
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-jv-stage-form]'); if (!form) return; event.preventDefault();
    var workspace = form.closest('[data-jv-workspace]'); var button = form.querySelector('button[type="submit"]'); if (button.disabled) return;
    var status = form.querySelector('[data-jv-stage-result]'); var stage = form.querySelector('[data-jv-stage]').value;
    var body = {action:'jv_stage', stage:stage, happened_at:get(form,'happened_at'), source_url:get(form,'source_url'), evidence_text:get(form,'evidence_text'), checks:{}};
    if (!body.happened_at || !body.source_url || !body.evidence_text) {status.textContent='Enter the actual time, source URL and what happened. Nothing was saved.';return;}
    var instant = new Date(body.happened_at + '-07:00');
    if (!Number.isFinite(instant.getTime())) {status.textContent='Enter the actual action date and time. Nothing was saved.';return;}
    body.happened_at = instant.toISOString();
    if (stage !== 'dead') {
      var complete = true; form.querySelectorAll('[data-jv-check]').forEach(function (el) {body.checks[el.dataset.jvCheck]=el.checked; if (!el.checked) complete=false;});
      if (!complete) {status.textContent='Tick every required check only if it is true. Nothing was saved.';return;}
      for (var key of ['buyer_id','buyer_price','signed_date_text','contract_source_url','agreement_source_url']) {
        if (!form.querySelector('[data-jv-field="'+key+'"]')) continue;
        var value=get(form,key); if (!value || key==='buyer_price' && !(Number(value)>0)) {status.textContent='Complete the buyer and signed-evidence fields shown. Nothing was saved.';return;}
        body[key]=key==='buyer_price'?Number(value):value;
      }
    }
    button.disabled=true;status.textContent='Saving recorded action...';
    request(endpoint(workspace,'jv-stage'),'POST',body).then(function () {saved(workspace);}).catch(function (error) {status.textContent=error.message;}).finally(function () {button.disabled=false;});
  });
  document.addEventListener('click', function (event) {
    var button=event.target.closest('[data-jv-command]'); if (!button || button.disabled) return;
    var workspace=button.closest('[data-jv-workspace]'); var action=button.dataset.jvCommand;
    if (action==='terms') {
      var scope=button.closest('[data-jv-terms]'); var result=scope.querySelector('[data-jv-terms-result]');
      var body={action:'terms',reason:get(scope,'terms_evidence'),evidence_url:get(scope,'terms_source')};
      if (!body.reason || !body.evidence_url) {result.textContent="Enter the holder's actual terms and their source URL. Nothing was saved.";return;}
      ['contract_price','holder_fee','jv_split','emd','closing_date','title_company'].forEach(function (key) {
        var value=get(scope,key); if (!value) return; body[key]=['closing_date','title_company'].includes(key)?value:Number(value)/(key==='jv_split'?100:1);
      });
      if (Object.keys(body).length===3) {result.textContent='Enter at least one holder term. Nothing was saved.';return;}
      button.disabled=true;result.textContent='Saving sourced terms...';
      request(endpoint(workspace,''),'PATCH',body).then(function () {saved(workspace);}).catch(function (error) {result.textContent=error.message;}).finally(function () {button.disabled=false;});return;
    }
    var output=workspace.querySelector('[data-jv-preview-result]'); var buyer=workspace.querySelector('[data-jv-preview-buyer]').value;
    if (!buyer) {output.textContent='Choose a matched buyer first.';return;}
    button.disabled=true;output.textContent='Loading read-only preview...';
    request(endpoint(workspace,action)+'?buyer_id='+encodeURIComponent(buyer),'GET').then(function (value) {
      output.replaceChildren(); var heading=document.createElement('p');heading.textContent='Preview only - not sent.';output.appendChild(heading);
      if (action==='buyer-teaser') {var text=document.createElement('pre');text.textContent=value.body;output.appendChild(text);return;}
      var rows=[['Property',value.address],['Title company',value.title_company],['Closing date',value.closing_date],['Signed date',value.signed_date],
        ['Asking price',value.asking_price == null ? '' : '$'+Number(value.asking_price).toLocaleString('en-US')],
        ['Holder contact',[value.holder_contact && value.holder_contact.name,value.holder_contact && value.holder_contact.phone,value.holder_contact && value.holder_contact.email].filter(Boolean).join(' / ')]];
      rows.forEach(function (row) {if (!row[1]) return;var line=document.createElement('p');line.textContent=row[0]+': '+row[1];output.appendChild(line);});
      [['Source',value.source_url],['Contract copy',value.contract_source_url],['Signed JV agreement',value.agreement_source_url]].forEach(function (row) {
        if (!/^https:\/\//.test(row[1]||'')) return;var line=document.createElement('p');var link=document.createElement('a');link.href=row[1];link.textContent=row[0];link.target='_blank';link.rel='noopener noreferrer';line.appendChild(link);output.appendChild(line);
      });
    }).catch(function (error) {output.textContent=error.message;}).finally(function () {button.disabled=false;});
  });
  root.wosJVWorkflow={render:render};
})(window);
