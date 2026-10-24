'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSTodayModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var GROUPS = ['overdue', 'due_today', 'review', 'waiting', 'upcoming'];

  function validDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }

  function groupActions(actions, today) {
    var groups = { overdue: [], due_today: [], review: [], waiting: [], upcoming: [] };
    if (!Array.isArray(actions)) return groups;
    var useToday = validDay(today);
    actions.forEach(function (action, index) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) return;
      var due = validDay(action.due_date) ? action.due_date : '';
      var urgency = '';
      if (useToday && due && due < today) urgency = 'overdue';
      else if (useToday && due === today) urgency = 'due_today';
      else if (!urgency && (action.kind === 'buyer' || ['Deal needs approval', 'Buyer needs approval', 'Reply waiting', 'Draft needs review'].indexOf(action.label) !== -1)) urgency = 'review';
      else if (!urgency && action.label === 'Waiting on someone else') urgency = 'waiting';
      if (!urgency) urgency = 'upcoming';
      groups[urgency].push({ action: action, index: index });
    });
    return groups;
  }

  return { groupActions: groupActions, validDay: validDay };
});
