// Keeps Android 11 car head units on Chromium 83 bootable. This classic script runs before any
// module chunk, so shared player dependencies cannot observe a missing ES2021 API first.
(function installCarLegacyWebViewPolyfills() {
    var defineIfMissing = function defineIfMissing(target, property, value) {
        if (property in target) return;
        Object.defineProperty(target, property, {
            configurable: true,
            writable: true,
            value: value
        });
    };

    var supportsFlexGap = function supportsFlexGap() {
        var probe = document.createElement('div');
        probe.style.cssText = 'display:flex;gap:10px;position:absolute;left:-1000px;top:0;';
        var first = document.createElement('span');
        var second = document.createElement('span');
        first.style.cssText = 'display:block;width:1px;height:1px;';
        second.style.cssText = 'display:block;width:1px;height:1px;';
        probe.appendChild(first);
        probe.appendChild(second);
        document.documentElement.appendChild(probe);
        var gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
        document.documentElement.removeChild(probe);
        return gap > 1;
    };

    if (!supportsFlexGap()) {
        document.documentElement.classList.add('legacy-flex-gap');
    }

    defineIfMissing(Object, 'hasOwn', function hasOwn(target, property) {
        return Object.prototype.hasOwnProperty.call(target, property);
    });

    function arrayAt(index) {
        var length = this.length;
        var relativeIndex = Math.trunc(index) || 0;
        var resolvedIndex = relativeIndex < 0 ? length + relativeIndex : relativeIndex;
        return resolvedIndex >= 0 && resolvedIndex < length ? this[resolvedIndex] : undefined;
    }

    defineIfMissing(Array.prototype, 'at', arrayAt);
    [
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array
    ].forEach(function installTypedArrayAt(Constructor) {
        defineIfMissing(Constructor.prototype, 'at', arrayAt);
    });

    defineIfMissing(String.prototype, 'replaceAll', function replaceAll(searchValue, replaceValue) {
        if (searchValue instanceof RegExp) {
            if (!searchValue.global) {
                throw new TypeError('replaceAll must be called with a global RegExp');
            }
            return this.replace(searchValue, replaceValue);
        }
        var escaped = String(searchValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.replace(new RegExp(escaped, 'g'), replaceValue);
    });

    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
        defineIfMissing(AbortSignal, 'timeout', function timeout(milliseconds) {
            var controller = new AbortController();
            window.setTimeout(function abortTimedOutRequest() {
                controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
            }, milliseconds);
            return controller.signal;
        });
    }

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
        defineIfMissing(crypto, 'randomUUID', function randomUUID() {
            var bytes = crypto.getRandomValues(new Uint8Array(16));
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            var hex = Array.from(bytes, function toHex(byte) {
                return byte.toString(16).padStart(2, '0');
            }).join('');
            return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
                + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
        });
    }

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'function') {
        var combiningMark = /\p{M}/u;
        var variationSelector = /^[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u;
        var regionalIndicator = /^[\u{1F1E6}-\u{1F1FF}]$/u;

        var isEmojiModifier = function isEmojiModifier(value) {
            var codePoint = value.codePointAt(0) || 0;
            return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
        };

        var isCjk = function isCjk(value) {
            var codePoint = value.codePointAt(0) || 0;
            return (codePoint >= 0x3040 && codePoint <= 0x30ff)
                || (codePoint >= 0x3100 && codePoint <= 0x312f)
                || (codePoint >= 0x3400 && codePoint <= 0x4dbf)
                || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
                || (codePoint >= 0xac00 && codePoint <= 0xd7af);
        };

        var graphemeParts = function graphemeParts(input) {
            var parts = [];
            var current = '';
            var regionalCount = 0;
            Array.from(input).forEach(function appendGrapheme(value) {
                var joinsCurrent = current.length > 0
                    && (combiningMark.test(value)
                        || variationSelector.test(value)
                        || isEmojiModifier(value)
                        || value === '\u200d'
                        || current.charAt(current.length - 1) === '\u200d'
                        || (regionalIndicator.test(value) && regionalCount === 1));
                if (!joinsCurrent) {
                    if (current) parts.push(current);
                    current = value;
                    regionalCount = regionalIndicator.test(value) ? 1 : 0;
                    return;
                }
                current += value;
                if (regionalIndicator.test(value)) regionalCount += 1;
            });
            if (current) parts.push(current);
            return parts;
        };

        var wordParts = function wordParts(input) {
            var parts = [];
            var current = '';
            var currentIsWord = false;
            var flush = function flush() {
                if (!current) return;
                parts.push({ text: current, wordLike: currentIsWord });
                current = '';
            };
            Array.from(input).forEach(function appendWord(value) {
                var isWhitespace = /^\s$/u.test(value);
                var isWord = !isWhitespace && /^[\p{L}\p{N}_]$/u.test(value);
                if (isCjk(value)) {
                    flush();
                    parts.push({ text: value, wordLike: true });
                    return;
                }
                if (!isWhitespace && !isWord) {
                    flush();
                    parts.push({ text: value, wordLike: false });
                    return;
                }
                if (current && currentIsWord !== isWord) flush();
                current += value;
                currentIsWord = isWord;
            });
            flush();
            return parts;
        };

        function Segmenter(locales, options) {
            if (!(this instanceof Segmenter)) {
                throw new TypeError("Intl.Segmenter must be called with 'new'");
            }
            this.locale = locales === undefined ? undefined : String(locales);
            this.granularity = options && options.granularity === 'word' ? 'word' : 'grapheme';
        }

        Segmenter.prototype.segment = function segment(input) {
            var text = String(input);
            var parts = this.granularity === 'word'
                ? wordParts(text)
                : graphemeParts(text).map(function graphemePart(value) {
                    return { text: value, wordLike: false };
                });
            var cursor = 0;
            return parts.map(function segmentPart(part) {
                var result = {
                    segment: part.text,
                    index: cursor,
                    input: text
                };
                if (this.granularity === 'word') result.isWordLike = part.wordLike;
                cursor += part.text.length;
                return result;
            }, this);
        };

        Segmenter.prototype.resolvedOptions = function resolvedOptions() {
            return {
                locale: this.locale || 'en',
                granularity: this.granularity
            };
        };

        defineIfMissing(Intl, 'Segmenter', Segmenter);
    }
})();
