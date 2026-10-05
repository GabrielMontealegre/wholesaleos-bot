'use strict';

const SUBJECT_PROPERTY_LABEL_PATTERN = '\\b(?:property\\s+address|(?:property\\s+)?commonly\\s+known\\s+as|also\\s+known\\s+as|property\\s+to\\s+be\\s+sold|real\\s+property\\s+(?:located|known)\\s+at|situs\\s+address|subject\\s+property|property\\s*:)\\s*[:#-]?';

module.exports = { SUBJECT_PROPERTY_LABEL_PATTERN };
