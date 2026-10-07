'use strict';

// Tests with historical source fixtures must not change meaning at midnight.
function installFixedClock(iso) {
  const NativeDate = global.Date;
  const instant = NativeDate.parse(iso);
  if (!Number.isFinite(instant)) throw new Error('Invalid test clock');
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  global.Date = FixedDate;
  return () => { global.Date = NativeDate; };
}

module.exports = { installFixedClock };
