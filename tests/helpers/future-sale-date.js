'use strict';

function futureSaleDate(today = new Date()) {
  const date = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  while (date.getDate() < 13) date.setDate(date.getDate() + 1);
  return date;
}

module.exports = { futureSaleDate };
