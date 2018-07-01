// // "23"
// var init = 0;
// init = init +1;
// // function test(test1, test2) {
// //   var temp = test1;
// //   var t = test2;
// //
// //   return temp ? t : t - 1;
// // }
// var i = 0;
// while (i < 10) {
//   i++;
//   i += 2;
//   if (i !== 0) {
//     i++;
//     var j = i;
//     j++;
//   }
// }
// // i = 0;
// // while (i < 5) {
// //   i++;
// //   i += 2;
// //   if (i !== 0) {
// //     i++;
// //     var k = i;
// //     k++;
// //   }
// // }
var UglifyJS = exports;

(function(MOZ_SourceMap,exports
          /*``*/) {
    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    /**
     * 将str分割为单个字符的列表
     * @param {string} str 需要分割的字符串
     */
    function characters(str) {
        return str.split("");
    };

    function member(name, array) {
        return array.indexOf(name) >= 0;
    };

    function find_if(func, array) {
        for (var i = 0, n = array.length; i < n; ++i) {
            if (func(array[i]))
                return array[i];
        }
    };

    function repeat_string(str, i) {
        if (i <= 0) return "";
        if (i == 1) return str;
        var d = repeat_string(str, i >> 1);
        d += d;
        if (i & 1) d += str;
        return d;
    };

    /**
     * 配置异常栈
     * @param {Function} fn 异常构造函数
     */
    function configure_error_stack(fn) {
        Object.defineProperty(fn.prototype, "stack", {
            get: function() {
                var err = new Error(this.message);
                err.name = this.name;
                try {
                    throw err;
                } catch(e) {
                    return e.stack;
                }
            }
        });
    }

    function DefaultsError(msg, defs) {
        this.message = msg;
        this.defs = defs;
    };
    DefaultsError.prototype = Object.create(Error.prototype);
    DefaultsError.prototype.constructor = DefaultsError;
    DefaultsError.prototype.name = "DefaultsError";
    configure_error_stack(DefaultsError);

    DefaultsError.croak = function(msg, defs) {
        throw new DefaultsError(msg, defs);
    };

    /**
     * 使用默认配置补全源配置
     * @param {Object} args 源配置
     * @param {Object} defs 默认配置
     * @param {Boolean} croak 当源配置中存在默认配置中不存在的配置项时，是否报错
     */
    function defaults(args, defs, croak) {
        if (args === true)
            args = {};
        var ret = args || {};
        if (croak) for (var i in ret) if (HOP(ret, i) && !HOP(defs, i))
            DefaultsError.croak("`" + i + "` is not a supported option", defs);
        for (var i in defs) if (HOP(defs, i)) {
            ret[i] = (args && HOP(args, i)) ? args[i] : defs[i];
        }
        return ret;
    };

    function merge(obj, ext) {
        var count = 0;
        for (var i in ext) if (HOP(ext, i)) {
            obj[i] = ext[i];
            count++;
        }
        return count;
    };

    function noop() {}
    function return_false() { return false; }
    function return_true() { return true; }
    function return_this() { return this; }
    function return_null() { return null; }

    var MAP = (function(){
        function MAP(a, f, backwards) {
            var ret = [], top = [], i;
            function doit() {
                var val = f(a[i], i);
                var is_last = val instanceof Last;
                if (is_last) val = val.v;
                if (val instanceof AtTop) {
                    val = val.v;
                    if (val instanceof Splice) {
                        top.push.apply(top, backwards ? val.v.slice().reverse() : val.v);
                    } else {
                        top.push(val);
                    }
                }
                else if (val !== skip) {
                    if (val instanceof Splice) {
                        ret.push.apply(ret, backwards ? val.v.slice().reverse() : val.v);
                    } else {
                        ret.push(val);
                    }
                }
                return is_last;
            };
            if (a instanceof Array) {
                if (backwards) {
                    for (i = a.length; --i >= 0;) if (doit()) break;
                    ret.reverse();
                    top.reverse();
                } else {
                    for (i = 0; i < a.length; ++i) if (doit()) break;
                }
            }
            else {
                for (i in a) if (HOP(a, i)) if (doit()) break;
            }
            return top.concat(ret);
        };
        MAP.at_top = function(val) { return new AtTop(val) };
        MAP.splice = function(val) { return new Splice(val) };
        MAP.last = function(val) { return new Last(val) };
        var skip = MAP.skip = {};
        function AtTop(val) { this.v = val };
        function Splice(val) { this.v = val };
        function Last(val) { this.v = val };
        return MAP;
    })();

    function push_uniq(array, el) {
        if (array.indexOf(el) < 0)
            array.push(el);
    };

    function string_template(text, props) {
        return text.replace(/\{(.+?)\}/g, function(str, p){
            return props && props[p];
        });
    };

    function remove(array, el) {
        for (var i = array.length; --i >= 0;) {
            if (array[i] === el) array.splice(i, 1);
        }
    };

    function mergeSort(array, cmp) {
        if (array.length < 2) return array.slice();
        function merge(a, b) {
            var r = [], ai = 0, bi = 0, i = 0;
            while (ai < a.length && bi < b.length) {
                cmp(a[ai], b[bi]) <= 0
                    ? r[i++] = a[ai++]
                    : r[i++] = b[bi++];
            }
            if (ai < a.length) r.push.apply(r, a.slice(ai));
            if (bi < b.length) r.push.apply(r, b.slice(bi));
            return r;
        };
        function _ms(a) {
            if (a.length <= 1)
                return a;
            var m = Math.floor(a.length / 2), left = a.slice(0, m), right = a.slice(m);
            left = _ms(left);
            right = _ms(right);
            return merge(left, right);
        };
        return _ms(array);
    };

// this function is taken from Acorn [1], written by Marijn Haverbeke
// [1] https://github.com/marijnh/acorn
    /**
     * 生成一个函数，用于判断str是否在关键字列表中
     * @param {array or strin } words 字符串列表或者字符串
     */
    function makePredicate(words) {
        if (!(words instanceof Array)) words = words.split(" ");
        var f = "", cats = [];
        out: for (var i = 0; i < words.length; ++i) {
            for (var j = 0; j < cats.length; ++j)
                if (cats[j][0].length == words[i].length) {
                    cats[j].push(words[i]);
                    continue out;
                }
            cats.push([words[i]]);
        }
        function quote(word) {
            return JSON.stringify(word).replace(/[\u2028\u2029]/g, function(s) {
                switch (s) {
                    case "\u2028": return "\\u2028";
                    case "\u2029": return "\\u2029";
                }
                return s;
            });
        }
        function compareTo(arr) {
            if (arr.length == 1) return f += "return str === " + quote(arr[0]) + ";";
            f += "switch(str){";
            for (var i = 0; i < arr.length; ++i) f += "case " + quote(arr[i]) + ":";
            f += "return true}return false;";
        }
        // When there are more than three length categories, an outer
        // switch first dispatches on the lengths, to save on comparisons.
        if (cats.length > 3) {
            cats.sort(function(a, b) {return b.length - a.length;});
            f += "switch(str.length){";
            for (var i = 0; i < cats.length; ++i) {
                var cat = cats[i];
                f += "case " + cat[0].length + ":";
                compareTo(cat);
            }
            f += "}";
            // Otherwise, simply generate a flat `switch` statement.
        } else {
            compareTo(words);
        }
        return new Function("str", f);
    };

    function all(array, predicate) {
        for (var i = array.length; --i >= 0;)
            if (!predicate(array[i]))
                return false;
        return true;
    };

    function Dictionary() {
        this._values = Object.create(null);
        this._size = 0;
    };
    Dictionary.prototype = {
        set: function(key, val) {
            if (!this.has(key)) ++this._size;
            this._values["$" + key] = val;
            return this;
        },
        add: function(key, val) {
            if (this.has(key)) {
                this.get(key).push(val);
            } else {
                this.set(key, [ val ]);
            }
            return this;
        },
        get: function(key) { return this._values["$" + key] },
        del: function(key) {
            if (this.has(key)) {
                --this._size;
                delete this._values["$" + key];
            }
            return this;
        },
        has: function(key) { return ("$" + key) in this._values },
        each: function(f) {
            for (var i in this._values)
                f(this._values[i], i.substr(1));
        },
        size: function() {
            return this._size;
        },
        map: function(f) {
            var ret = [];
            for (var i in this._values)
                ret.push(f(this._values[i], i.substr(1)));
            return ret;
        },
        toObject: function() { return this._values }
    };
    Dictionary.fromObject = function(obj) {
        var dict = new Dictionary();
        dict._size = merge(dict._values, obj);
        return dict;
    };

    function HOP(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
    }

// return true if the node at the top of the stack (that means the
// innermost node in the current output) is lexically the first in
// a statement.
    function first_in_statement(stack) {
        var node = stack.parent(-1);
        for (var i = 0, p; p = stack.parent(i); i++) {
            if (p instanceof AST_Statement && p.body === node)
                return true;
            if ((p instanceof AST_Sequence      && p.expressions[0] === node) ||
                (p.TYPE == "Call"               && p.expression === node ) ||
                (p instanceof AST_Dot           && p.expression === node ) ||
                (p instanceof AST_Sub           && p.expression === node ) ||
                (p instanceof AST_Conditional   && p.condition === node  ) ||
                (p instanceof AST_Binary        && p.left === node       ) ||
                (p instanceof AST_UnaryPostfix  && p.expression === node ))
            {
                node = p;
            } else {
                return false;
            }
        }
    }


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    function DEFNODE(type, props, methods, base) {
        if (arguments.length < 4) base = AST_Node;
        if (!props) props = [];
        else props = props.split(/\s+/);
        var self_props = props;
        if (base && base.PROPS)
            props = props.concat(base.PROPS);
        var code = "return function AST_" + type + "(props){ if (props) { ";
        for (var i = props.length; --i >= 0;) {
            code += "this." + props[i] + " = props." + props[i] + ";";
        }
        var proto = base && new base;
        if (proto && proto.initialize || (methods && methods.initialize))
            code += "this.initialize();";
        code += "}}";
        var ctor = new Function(code)();
        if (proto) {
            ctor.prototype = proto;
            ctor.BASE = base;
        }
        if (base) base.SUBCLASSES.push(ctor);
        ctor.prototype.CTOR = ctor;
        ctor.PROPS = props || null;
        ctor.SELF_PROPS = self_props;
        ctor.SUBCLASSES = [];
        if (type) {
            ctor.prototype.TYPE = ctor.TYPE = type;
        }
        if (methods) for (i in methods) if (HOP(methods, i)) {
            if (/^\$/.test(i)) {
                ctor[i.substr(1)] = methods[i];
            } else {
                ctor.prototype[i] = methods[i];
            }
        }
        ctor.DEFMETHOD = function(name, method) {
            this.prototype[name] = method;
        };
        if (typeof exports !== "undefined") {
            exports["AST_" + type] = ctor;
        }
        return ctor;
    };

    var AST_Token = DEFNODE("Token", "type value line col pos endline endcol endpos nlb comments_before comments_after file raw", {
    }, null);

    var AST_Node = DEFNODE("Node", "start end", {
        _clone: function(deep) {
            if (deep) {
                var self = this.clone();
                return self.transform(new TreeTransformer(function(node) {
                    if (node !== self) {
                        return node.clone(true);
                    }
                }));
            }
            return new this.CTOR(this);
        },
        clone: function(deep) {
            return this._clone(deep);
        },
        $documentation: "Base class of all AST nodes",
        $propdoc: {
            start: "[AST_Token] The first token of this node",
            end: "[AST_Token] The last token of this node"
        },
        _walk: function(visitor) {
            return visitor._visit(this);
        },
        walk: function(visitor) {
            return this._walk(visitor); // not sure the indirection will be any help
        }
    }, null);

    AST_Node.warn_function = null;
    AST_Node.warn = function(txt, props) {
        if (AST_Node.warn_function)
            AST_Node.warn_function(string_template(txt, props));
    };

    /* -----[ statements ]----- */

    var AST_Statement = DEFNODE("Statement", null, {
        $documentation: "Base class of all statements",
    });

    var AST_Debugger = DEFNODE("Debugger", null, {
        $documentation: "Represents a debugger statement",
    }, AST_Statement);

    var AST_Directive = DEFNODE("Directive", "value quote", {
        $documentation: "Represents a directive, like \"use strict\";",
        $propdoc: {
            value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
            quote: "[string] the original quote character"
        },
    }, AST_Statement);

    var AST_SimpleStatement = DEFNODE("SimpleStatement", "body", {
        $documentation: "A statement consisting of an expression, i.e. a = 1 + 2",
        $propdoc: {
            body: "[AST_Node] an expression node (should not be instanceof AST_Statement)"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.body._walk(visitor);
            });
        }
    }, AST_Statement);

    function walk_body(node, visitor) {
        var body = node.body;
        if (body instanceof AST_Statement) {
            body._walk(visitor);
        }
        else for (var i = 0, len = body.length; i < len; i++) {
            body[i]._walk(visitor);
        }
    };

    var AST_Block = DEFNODE("Block", "body", {
        $documentation: "A body of statements (usually bracketed)",
        $propdoc: {
            body: "[AST_Statement*] an array of statements"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                walk_body(this, visitor);
            });
        }
    }, AST_Statement);

    var AST_BlockStatement = DEFNODE("BlockStatement", null, {
        $documentation: "A block statement",
    }, AST_Block);

    var AST_EmptyStatement = DEFNODE("EmptyStatement", null, {
        $documentation: "The empty statement (empty block or simply a semicolon)"
    }, AST_Statement);

    var AST_StatementWithBody = DEFNODE("StatementWithBody", "body", {
        $documentation: "Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`",
        $propdoc: {
            body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
        }
    }, AST_Statement);

    var AST_LabeledStatement = DEFNODE("LabeledStatement", "label", {
        $documentation: "Statement with a label",
        $propdoc: {
            label: "[AST_Label] a label definition"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.label._walk(visitor);
                this.body._walk(visitor);
            });
        },
        clone: function(deep) {
            var node = this._clone(deep);
            if (deep) {
                var label = node.label;
                var def = this.label;
                node.walk(new TreeWalker(function(node) {
                    if (node instanceof AST_LoopControl
                        && node.label && node.label.thedef === def) {
                        node.label.thedef = label;
                        label.references.push(node);
                    }
                }));
            }
            return node;
        }
    }, AST_StatementWithBody);

    var AST_IterationStatement = DEFNODE("IterationStatement", null, {
        $documentation: "Internal class.  All loops inherit from it."
    }, AST_StatementWithBody);

    var AST_DWLoop = DEFNODE("DWLoop", "condition", {
        $documentation: "Base class for do/while statements",
        $propdoc: {
            condition: "[AST_Node] the loop condition.  Should not be instanceof AST_Statement"
        }
    }, AST_IterationStatement);

    var AST_Do = DEFNODE("Do", null, {
        $documentation: "A `do` statement",
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.body._walk(visitor);
                this.condition._walk(visitor);
            });
        }
    }, AST_DWLoop);

    var AST_While = DEFNODE("While", null, {
        $documentation: "A `while` statement",
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.condition._walk(visitor);
                this.body._walk(visitor);
            });
        }
    }, AST_DWLoop);

    var AST_For = DEFNODE("For", "init condition step", {
        $documentation: "A `for` statement",
        $propdoc: {
            init: "[AST_Node?] the `for` initialization code, or null if empty",
            condition: "[AST_Node?] the `for` termination clause, or null if empty",
            step: "[AST_Node?] the `for` update clause, or null if empty"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                if (this.init) this.init._walk(visitor);
                if (this.condition) this.condition._walk(visitor);
                if (this.step) this.step._walk(visitor);
                this.body._walk(visitor);
            });
        }
    }, AST_IterationStatement);

    var AST_ForIn = DEFNODE("ForIn", "init name object", {
        $documentation: "A `for ... in` statement",
        $propdoc: {
            init: "[AST_Node] the `for/in` initialization code",
            name: "[AST_SymbolRef?] the loop variable, only if `init` is AST_Var",
            object: "[AST_Node] the object that we're looping through"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.init._walk(visitor);
                this.object._walk(visitor);
                this.body._walk(visitor);
            });
        }
    }, AST_IterationStatement);

    var AST_With = DEFNODE("With", "expression", {
        $documentation: "A `with` statement",
        $propdoc: {
            expression: "[AST_Node] the `with` expression"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
                this.body._walk(visitor);
            });
        }
    }, AST_StatementWithBody);

    /* -----[ scope and functions ]----- */

    var AST_Scope = DEFNODE("Scope", "variables functions uses_with uses_eval parent_scope enclosed cname", {
        $documentation: "Base class for all statements introducing a lexical scope",
        $propdoc: {
            variables: "[Object/S] a map of name -> SymbolDef for all variables/functions defined in this scope",
            functions: "[Object/S] like `variables`, but only lists function declarations",
            uses_with: "[boolean/S] tells whether this scope uses the `with` statement",
            uses_eval: "[boolean/S] tells whether this scope contains a direct call to the global `eval`",
            parent_scope: "[AST_Scope?/S] link to the parent scope",
            enclosed: "[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes",
            cname: "[integer/S] current index for mangling variables (used internally by the mangler)",
        },
    }, AST_Block);

    var AST_Toplevel = DEFNODE("Toplevel", "globals", {
        $documentation: "The toplevel scope",
        $propdoc: {
            globals: "[Object/S] a map of name -> SymbolDef for all undeclared names",
        },
        wrap_commonjs: function(name) {
            var body = this.body;
            var wrapped_tl = "(function(exports){'$ORIG';})(typeof " + name + "=='undefined'?(" + name + "={}):" + name + ");";
            wrapped_tl = parse(wrapped_tl);
            wrapped_tl = wrapped_tl.transform(new TreeTransformer(function before(node){
                if (node instanceof AST_Directive && node.value == "$ORIG") {
                    return MAP.splice(body);
                }
            }));
            return wrapped_tl;
        }
    }, AST_Scope);

    var AST_Lambda = DEFNODE("Lambda", "name argnames uses_arguments", {
        $documentation: "Base class for functions",
        $propdoc: {
            name: "[AST_SymbolDeclaration?] the name of this function",
            argnames: "[AST_SymbolFunarg*] array of function arguments",
            uses_arguments: "[boolean/S] tells whether this function accesses the arguments array"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                if (this.name) this.name._walk(visitor);
                var argnames = this.argnames;
                for (var i = 0, len = argnames.length; i < len; i++) {
                    argnames[i]._walk(visitor);
                }
                walk_body(this, visitor);
            });
        }
    }, AST_Scope);

    var AST_Accessor = DEFNODE("Accessor", null, {
        $documentation: "A setter/getter function.  The `name` property is always null."
    }, AST_Lambda);

    var AST_Function = DEFNODE("Function", "inlined", {
        $documentation: "A function expression"
    }, AST_Lambda);

    var AST_Defun = DEFNODE("Defun", "inlined", {
        $documentation: "A function definition"
    }, AST_Lambda);

    /* -----[ JUMPS ]----- */

    var AST_Jump = DEFNODE("Jump", null, {
        $documentation: "Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"
    }, AST_Statement);

    var AST_Exit = DEFNODE("Exit", "value", {
        $documentation: "Base class for “exits” (`return` and `throw`)",
        $propdoc: {
            value: "[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return"
        },
        _walk: function(visitor) {
            return visitor._visit(this, this.value && function(){
                this.value._walk(visitor);
            });
        }
    }, AST_Jump);

    var AST_Return = DEFNODE("Return", null, {
        $documentation: "A `return` statement"
    }, AST_Exit);

    var AST_Throw = DEFNODE("Throw", null, {
        $documentation: "A `throw` statement"
    }, AST_Exit);

    var AST_LoopControl = DEFNODE("LoopControl", "label", {
        $documentation: "Base class for loop control statements (`break` and `continue`)",
        $propdoc: {
            label: "[AST_LabelRef?] the label, or null if none",
        },
        _walk: function(visitor) {
            return visitor._visit(this, this.label && function(){
                this.label._walk(visitor);
            });
        }
    }, AST_Jump);

    var AST_Break = DEFNODE("Break", null, {
        $documentation: "A `break` statement"
    }, AST_LoopControl);

    var AST_Continue = DEFNODE("Continue", null, {
        $documentation: "A `continue` statement"
    }, AST_LoopControl);

    /* -----[ IF ]----- */

    var AST_If = DEFNODE("If", "condition alternative", {
        $documentation: "A `if` statement",
        $propdoc: {
            condition: "[AST_Node] the `if` condition",
            alternative: "[AST_Statement?] the `else` part, or null if not present"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.condition._walk(visitor);
                this.body._walk(visitor);
                if (this.alternative) this.alternative._walk(visitor);
            });
        }
    }, AST_StatementWithBody);

    /* -----[ SWITCH ]----- */

    var AST_Switch = DEFNODE("Switch", "expression", {
        $documentation: "A `switch` statement",
        $propdoc: {
            expression: "[AST_Node] the `switch` “discriminant”"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
                walk_body(this, visitor);
            });
        }
    }, AST_Block);

    var AST_SwitchBranch = DEFNODE("SwitchBranch", null, {
        $documentation: "Base class for `switch` branches",
    }, AST_Block);

    var AST_Default = DEFNODE("Default", null, {
        $documentation: "A `default` switch branch",
    }, AST_SwitchBranch);

    var AST_Case = DEFNODE("Case", "expression", {
        $documentation: "A `case` switch branch",
        $propdoc: {
            expression: "[AST_Node] the `case` expression"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
                walk_body(this, visitor);
            });
        }
    }, AST_SwitchBranch);

    /* -----[ EXCEPTIONS ]----- */

    var AST_Try = DEFNODE("Try", "bcatch bfinally", {
        $documentation: "A `try` statement",
        $propdoc: {
            bcatch: "[AST_Catch?] the catch block, or null if not present",
            bfinally: "[AST_Finally?] the finally block, or null if not present"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                walk_body(this, visitor);
                if (this.bcatch) this.bcatch._walk(visitor);
                if (this.bfinally) this.bfinally._walk(visitor);
            });
        }
    }, AST_Block);

    var AST_Catch = DEFNODE("Catch", "argname", {
        $documentation: "A `catch` node; only makes sense as part of a `try` statement",
        $propdoc: {
            argname: "[AST_SymbolCatch] symbol for the exception"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.argname._walk(visitor);
                walk_body(this, visitor);
            });
        }
    }, AST_Block);

    var AST_Finally = DEFNODE("Finally", null, {
        $documentation: "A `finally` node; only makes sense as part of a `try` statement"
    }, AST_Block);

    /* -----[ VAR ]----- */

    var AST_Definitions = DEFNODE("Definitions", "definitions", {
        $documentation: "Base class for `var` nodes (variable declarations/initializations)",
        $propdoc: {
            definitions: "[AST_VarDef*] array of variable definitions"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                var definitions = this.definitions;
                for (var i = 0, len = definitions.length; i < len; i++) {
                    definitions[i]._walk(visitor);
                }
            });
        }
    }, AST_Statement);

    var AST_Var = DEFNODE("Var", null, {
        $documentation: "A `var` statement"
    }, AST_Definitions);

    var AST_VarDef = DEFNODE("VarDef", "name value", {
        $documentation: "A variable declaration; only appears in a AST_Definitions node",
        $propdoc: {
            name: "[AST_SymbolVar] name of the variable",
            value: "[AST_Node?] initializer, or null of there's no initializer"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.name._walk(visitor);
                if (this.value) this.value._walk(visitor);
            });
        }
    });

    /* -----[ OTHER ]----- */

    var AST_Call = DEFNODE("Call", "expression args", {
        $documentation: "A function call expression",
        $propdoc: {
            expression: "[AST_Node] expression to invoke as function",
            args: "[AST_Node*] array of arguments"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                var args = this.args;
                for (var i = 0, len = args.length; i < len; i++) {
                    args[i]._walk(visitor);
                }
                this.expression._walk(visitor);
            });
        }
    });

    var AST_New = DEFNODE("New", null, {
        $documentation: "An object instantiation.  Derives from a function call since it has exactly the same properties"
    }, AST_Call);

    var AST_Sequence = DEFNODE("Sequence", "expressions", {
        $documentation: "A sequence expression (comma-separated expressions)",
        $propdoc: {
            expressions: "[AST_Node*] array of expressions (at least two)"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expressions.forEach(function(node) {
                    node._walk(visitor);
                });
            });
        }
    });

    var AST_PropAccess = DEFNODE("PropAccess", "expression property", {
        $documentation: "Base class for property access expressions, i.e. `a.foo` or `a[\"foo\"]`",
        $propdoc: {
            expression: "[AST_Node] the “container” expression",
            property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
        }
    });

    var AST_Dot = DEFNODE("Dot", null, {
        $documentation: "A dotted property access expression",
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
            });
        }
    }, AST_PropAccess);

    var AST_Sub = DEFNODE("Sub", null, {
        $documentation: "Index-style property access, i.e. `a[\"foo\"]`",
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
                this.property._walk(visitor);
            });
        }
    }, AST_PropAccess);

    var AST_Unary = DEFNODE("Unary", "operator expression", {
        $documentation: "Base class for unary expressions",
        $propdoc: {
            operator: "[string] the operator",
            expression: "[AST_Node] expression that this unary operator applies to"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.expression._walk(visitor);
            });
        }
    });

    var AST_UnaryPrefix = DEFNODE("UnaryPrefix", null, {
        $documentation: "Unary prefix expression, i.e. `typeof i` or `++i`"
    }, AST_Unary);

    var AST_UnaryPostfix = DEFNODE("UnaryPostfix", null, {
        $documentation: "Unary postfix expression, i.e. `i++`"
    }, AST_Unary);

    var AST_Binary = DEFNODE("Binary", "operator left right", {
        $documentation: "Binary expression, i.e. `a + b`",
        $propdoc: {
            left: "[AST_Node] left-hand side expression",
            operator: "[string] the operator",
            right: "[AST_Node] right-hand side expression"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.left._walk(visitor);
                this.right._walk(visitor);
            });
        }
    });

    var AST_Conditional = DEFNODE("Conditional", "condition consequent alternative", {
        $documentation: "Conditional expression using the ternary operator, i.e. `a ? b : c`",
        $propdoc: {
            condition: "[AST_Node]",
            consequent: "[AST_Node]",
            alternative: "[AST_Node]"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.condition._walk(visitor);
                this.consequent._walk(visitor);
                this.alternative._walk(visitor);
            });
        }
    });

    var AST_Assign = DEFNODE("Assign", null, {
        $documentation: "An assignment expression — `a = b + 5`",
    }, AST_Binary);

    /* -----[ LITERALS ]----- */

    var AST_Array = DEFNODE("Array", "elements", {
        $documentation: "An array literal",
        $propdoc: {
            elements: "[AST_Node*] array of elements"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                var elements = this.elements;
                for (var i = 0, len = elements.length; i < len; i++) {
                    elements[i]._walk(visitor);
                }
            });
        }
    });

    var AST_Object = DEFNODE("Object", "properties", {
        $documentation: "An object literal",
        $propdoc: {
            properties: "[AST_ObjectProperty*] array of properties"
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                var properties = this.properties;
                for (var i = 0, len = properties.length; i < len; i++) {
                    properties[i]._walk(visitor);
                }
            });
        }
    });

    var AST_ObjectProperty = DEFNODE("ObjectProperty", "key value", {
        $documentation: "Base class for literal object properties",
        $propdoc: {
            key: "[string] the property name converted to a string for ObjectKeyVal.  For setters and getters this is an AST_SymbolAccessor.",
            value: "[AST_Node] property value.  For setters and getters this is an AST_Accessor."
        },
        _walk: function(visitor) {
            return visitor._visit(this, function(){
                this.value._walk(visitor);
            });
        }
    });

    var AST_ObjectKeyVal = DEFNODE("ObjectKeyVal", "quote", {
        $documentation: "A key: value object property",
        $propdoc: {
            quote: "[string] the original quote character"
        }
    }, AST_ObjectProperty);

    var AST_ObjectSetter = DEFNODE("ObjectSetter", null, {
        $documentation: "An object setter property",
    }, AST_ObjectProperty);

    var AST_ObjectGetter = DEFNODE("ObjectGetter", null, {
        $documentation: "An object getter property",
    }, AST_ObjectProperty);

    var AST_Symbol = DEFNODE("Symbol", "scope name thedef", {
        $propdoc: {
            name: "[string] name of this symbol",
            scope: "[AST_Scope/S] the current scope (not necessarily the definition scope)",
            thedef: "[SymbolDef/S] the definition of this symbol"
        },
        $documentation: "Base class for all symbols",
    });

    var AST_SymbolAccessor = DEFNODE("SymbolAccessor", null, {
        $documentation: "The name of a property accessor (setter/getter function)"
    }, AST_Symbol);

    var AST_SymbolDeclaration = DEFNODE("SymbolDeclaration", "init", {
        $documentation: "A declaration symbol (symbol in var, function name or argument, symbol in catch)",
    }, AST_Symbol);

    var AST_SymbolVar = DEFNODE("SymbolVar", null, {
        $documentation: "Symbol defining a variable",
    }, AST_SymbolDeclaration);

    var AST_SymbolFunarg = DEFNODE("SymbolFunarg", null, {
        $documentation: "Symbol naming a function argument",
    }, AST_SymbolVar);

    var AST_SymbolDefun = DEFNODE("SymbolDefun", null, {
        $documentation: "Symbol defining a function",
    }, AST_SymbolDeclaration);

    var AST_SymbolLambda = DEFNODE("SymbolLambda", null, {
        $documentation: "Symbol naming a function expression",
    }, AST_SymbolDeclaration);

    var AST_SymbolCatch = DEFNODE("SymbolCatch", null, {
        $documentation: "Symbol naming the exception in catch",
    }, AST_SymbolDeclaration);

    var AST_Label = DEFNODE("Label", "references", {
        $documentation: "Symbol naming a label (declaration)",
        $propdoc: {
            references: "[AST_LoopControl*] a list of nodes referring to this label"
        },
        initialize: function() {
            this.references = [];
            this.thedef = this;
        }
    }, AST_Symbol);

    var AST_SymbolRef = DEFNODE("SymbolRef", null, {
        $documentation: "Reference to some symbol (not definition/declaration)",
    }, AST_Symbol);

    var AST_LabelRef = DEFNODE("LabelRef", null, {
        $documentation: "Reference to a label symbol",
    }, AST_Symbol);

    var AST_This = DEFNODE("This", null, {
        $documentation: "The `this` symbol",
    }, AST_Symbol);

    var AST_Constant = DEFNODE("Constant", null, {
        $documentation: "Base class for all constants",
        getValue: function() {
            return this.value;
        }
    });

    var AST_String = DEFNODE("String", "value quote", {
        $documentation: "A string literal",
        $propdoc: {
            value: "[string] the contents of this string",
            quote: "[string] the original quote character"
        }
    }, AST_Constant);

    var AST_Number = DEFNODE("Number", "value literal", {
        $documentation: "A number literal",
        $propdoc: {
            value: "[number] the numeric value",
            literal: "[string] numeric value as string (optional)"
        }
    }, AST_Constant);

    var AST_RegExp = DEFNODE("RegExp", "value", {
        $documentation: "A regexp literal",
        $propdoc: {
            value: "[RegExp] the actual regexp"
        }
    }, AST_Constant);

    var AST_Atom = DEFNODE("Atom", null, {
        $documentation: "Base class for atoms",
    }, AST_Constant);

    var AST_Null = DEFNODE("Null", null, {
        $documentation: "The `null` atom",
        value: null
    }, AST_Atom);

    var AST_NaN = DEFNODE("NaN", null, {
        $documentation: "The impossible value",
        value: 0/0
    }, AST_Atom);

    var AST_Undefined = DEFNODE("Undefined", null, {
        $documentation: "The `undefined` value",
        value: (function(){}())
    }, AST_Atom);

    var AST_Hole = DEFNODE("Hole", null, {
        $documentation: "A hole in an array",
        value: (function(){}())
    }, AST_Atom);

    var AST_Infinity = DEFNODE("Infinity", null, {
        $documentation: "The `Infinity` value",
        value: 1/0
    }, AST_Atom);

    var AST_Boolean = DEFNODE("Boolean", null, {
        $documentation: "Base class for booleans",
    }, AST_Atom);

    var AST_False = DEFNODE("False", null, {
        $documentation: "The `false` atom",
        value: false
    }, AST_Boolean);

    var AST_True = DEFNODE("True", null, {
        $documentation: "The `true` atom",
        value: true
    }, AST_Boolean);

    /* -----[ TreeWalker ]----- */

    function TreeWalker(callback) {
        this.visit = callback;
        this.stack = [];
        this.directives = Object.create(null);
    };
    TreeWalker.prototype = {
        _visit: function(node, descend) {
            this.push(node);
            var ret = this.visit(node, descend ? function(){
                descend.call(node);
            } : noop);
            if (!ret && descend) {
                descend.call(node);
            }
            this.pop();
            return ret;
        },
        parent: function(n) {
            return this.stack[this.stack.length - 2 - (n || 0)];
        },
        push: function(node) {
            if (node instanceof AST_Lambda) {
                this.directives = Object.create(this.directives);
            } else if (node instanceof AST_Directive && !this.directives[node.value]) {
                this.directives[node.value] = node;
            }
            this.stack.push(node);
        },
        pop: function() {
            if (this.stack.pop() instanceof AST_Lambda) {
                this.directives = Object.getPrototypeOf(this.directives);
            }
        },
        self: function() {
            return this.stack[this.stack.length - 1];
        },
        find_parent: function(type) {
            var stack = this.stack;
            for (var i = stack.length; --i >= 0;) {
                var x = stack[i];
                if (x instanceof type) return x;
            }
        },
        has_directive: function(type) {
            var dir = this.directives[type];
            if (dir) return dir;
            var node = this.stack[this.stack.length - 1];
            if (node instanceof AST_Scope) {
                for (var i = 0; i < node.body.length; ++i) {
                    var st = node.body[i];
                    if (!(st instanceof AST_Directive)) break;
                    if (st.value == type) return st;
                }
            }
        },
        loopcontrol_target: function(node) {
            var stack = this.stack;
            if (node.label) for (var i = stack.length; --i >= 0;) {
                var x = stack[i];
                if (x instanceof AST_LabeledStatement && x.label.name == node.label.name)
                    return x.body;
            } else for (var i = stack.length; --i >= 0;) {
                var x = stack[i];
                if (x instanceof AST_IterationStatement
                    || node instanceof AST_Break && x instanceof AST_Switch)
                    return x;
            }
        }
    };


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>
     Parser based on parse-js (http://marijn.haverbeke.nl/parse-js/).

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    var KEYWORDS = 'break case catch const continue debugger default delete do else finally for function if in instanceof new return switch throw try typeof var void while with';
    var KEYWORDS_ATOM = 'false null true';
    var RESERVED_WORDS = 'abstract boolean byte char class double enum export extends final float goto implements import int interface let long native package private protected public short static super synchronized this throws transient volatile yield'
        + " " + KEYWORDS_ATOM + " " + KEYWORDS;
    var KEYWORDS_BEFORE_EXPRESSION = 'return new delete throw else case';

    KEYWORDS = makePredicate(KEYWORDS);
    RESERVED_WORDS = makePredicate(RESERVED_WORDS);
    KEYWORDS_BEFORE_EXPRESSION = makePredicate(KEYWORDS_BEFORE_EXPRESSION);
    KEYWORDS_ATOM = makePredicate(KEYWORDS_ATOM);

    var OPERATOR_CHARS = makePredicate(characters("+-*&%=<>!?|~^"));

    var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
    var RE_OCT_NUMBER = /^0[0-7]+$/;

    var OPERATORS = makePredicate([
        "in",
        "instanceof",
        "typeof",
        "new",
        "void",
        "delete",
        "++",
        "--",
        "+",
        "-",
        "!",
        "~",
        "&",
        "|",
        "^",
        "*",
        "/",
        "%",
        ">>",
        "<<",
        ">>>",
        "<",
        ">",
        "<=",
        ">=",
        "==",
        "===",
        "!=",
        "!==",
        "?",
        "=",
        "+=",
        "-=",
        "/=",
        "*=",
        "%=",
        ">>=",
        "<<=",
        ">>>=",
        "|=",
        "^=",
        "&=",
        "&&",
        "||"
    ]);
// 创建空白符预测函数
    var WHITESPACE_CHARS = makePredicate(characters(" \u00a0\n\r\t\f\u000b\u200b\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\uFEFF"));
// 创建换行符预测函数
    var NEWLINE_CHARS = makePredicate(characters("\n\r\u2028\u2029"));

    var PUNC_BEFORE_EXPRESSION = makePredicate(characters("[{(,;:"));

    var PUNC_CHARS = makePredicate(characters("[]{}(),;:"));

    /* -----[ Tokenizer ]----- */

// regexps adapted from http://xregexp.com/plugins/#unicode
    var UNICODE = {
        letter: new RegExp("[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u037F\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u08A0-\\u08B2\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971-\\u0980\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0CF1\\u0CF2\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0EDC-\\u0EDF\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10A0-\\u10C5\\u10C7\\u10CD\\u10D0-\\u10FA\\u10FC-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u16EE-\\u16F8\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191E\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1AA7\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1BBA-\\u1BE5\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D\\u1CE9-\\u1CEC\\u1CEE-\\u1CF1\\u1CF5\\u1CF6\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090-\\u209C\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2160-\\u2188\\u2C00-\\u2C2E\\u2C30-\\u2C5E\\u2C60-\\u2CE4\\u2CEB-\\u2CEE\\u2CF2\\u2CF3\\u2D00-\\u2D25\\u2D27\\u2D2D\\u2D30-\\u2D67\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005-\\u3007\\u3021-\\u3029\\u3031-\\u3035\\u3038-\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31BA\\u31F0-\\u31FF\\u3400-\\u4DB5\\u4E00-\\u9FCC\\uA000-\\uA48C\\uA4D0-\\uA4FD\\uA500-\\uA60C\\uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA66E\\uA67F-\\uA69D\\uA6A0-\\uA6EF\\uA717-\\uA71F\\uA722-\\uA788\\uA78B-\\uA78E\\uA790-\\uA7AD\\uA7B0\\uA7B1\\uA7F7-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA8F2-\\uA8F7\\uA8FB\\uA90A-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uA9CF\\uA9E0-\\uA9E4\\uA9E6-\\uA9EF\\uA9FA-\\uA9FE\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA60-\\uAA76\\uAA7A\\uAA7E-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB-\\uAADD\\uAAE0-\\uAAEA\\uAAF2-\\uAAF4\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uAB30-\\uAB5A\\uAB5C-\\uAB5F\\uAB64\\uAB65\\uABC0-\\uABE2\\uAC00-\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA6D\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"),
        digit: new RegExp("[\\u0030-\\u0039\\u0660-\\u0669\\u06F0-\\u06F9\\u07C0-\\u07C9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0DE6-\\u0DEF\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uA9F0-\\uA9F9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19]"),
        non_spacing_mark: new RegExp("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065E\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0900-\\u0902\\u093C\\u0941-\\u0948\\u094D\\u0951-\\u0955\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CBF\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F90-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u1074\\u1082\\u1085\\u1086\\u108D\\u109D\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA8\\u1BA9\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFD-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\uA67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\uA982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\uAA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"),
        space_combining_mark: new RegExp("[\\u0903\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u0982\\u0983\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u106D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u17B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24-\\u1C2B\\u1C34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]"),
        connector_punctuation: new RegExp("[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]")
    };

    function is_letter(code) {
        return (code >= 97 && code <= 122)
            || (code >= 65 && code <= 90)
            || (code >= 0xaa && UNICODE.letter.test(String.fromCharCode(code)));
    };

    function is_surrogate_pair_head(code) {
        if (typeof code == "string")
            code = code.charCodeAt(0);
        return code >= 0xd800 && code <= 0xdbff;
    }

    function is_surrogate_pair_tail(code) {
        if (typeof code == "string")
            code = code.charCodeAt(0);
        return code >= 0xdc00 && code <= 0xdfff;
    }

    /**
     * 判断是否是数字
     * @param {UNICODE} code Unicode编码
     * @returns boolean
     */
    function is_digit(code) {
        return code >= 48 && code <= 57;
    };

    /**
     * 判断是否为数字或者字母
     * @param {UNICODE} code 字符的Unicode编码
     * @returns boolean
     */
    function is_alphanumeric_char(code) {
        return is_digit(code) || is_letter(code);
    };

    function is_unicode_digit(code) {
        return UNICODE.digit.test(String.fromCharCode(code));
    }

    function is_unicode_combining_mark(ch) {
        return UNICODE.non_spacing_mark.test(ch) || UNICODE.space_combining_mark.test(ch);
    };

    function is_unicode_connector_punctuation(ch) {
        return UNICODE.connector_punctuation.test(ch);
    };

    function is_identifier(name) {
        return !RESERVED_WORDS(name) && /^[a-z_$][a-z0-9_$]*$/i.test(name);
    };

    /**
     * 判断是否为标识符
     * @param {UNICODE} code 字符Unicode编码
     */
    function is_identifier_start(code) {
        // 以，$ ，_ ，字母开头为标识符
        return code == 36 || code == 95 || is_letter(code);
    };

    /**
     * 验证ch是否符合标识符字符
     * @param {char} ch 字符
     */
    function is_identifier_char(ch) {
        var code = ch.charCodeAt(0);
        return is_identifier_start(code)
            || is_digit(code)
            || code == 8204 // \u200c: zero-width non-joiner <ZWNJ>
            || code == 8205 // \u200d: zero-width joiner <ZWJ> (in my ECMA-262 PDF, this is also 200c)
            || is_unicode_combining_mark(ch)
            || is_unicode_connector_punctuation(ch)
            || is_unicode_digit(code)
            ;
    };

    function is_identifier_string(str){
        return /^[a-z_$][a-z0-9_$]*$/i.test(str);
    };

    /**
     * 利用正则匹配解析数字
     * @param {string} num 数字串
     */
    function parse_js_number(num) {
        if (RE_HEX_NUMBER.test(num)) {
            return parseInt(num.substr(2), 16);
        } else if (RE_OCT_NUMBER.test(num)) {
            return parseInt(num.substr(1), 8);
        } else {
            var val = parseFloat(num);
            if (val == num) return val;
        }
    };

    /**
     * 异常构造函数
     * @param {String} message 异常消息
     * @param {string} filename 抛出异常的文件
     * @param {int} line 行号
     * @param {int} col 列号
     * @param {int} pos 位置
     */
    function JS_Parse_Error(message, filename, line, col, pos) {
        this.message = message;
        this.filename = filename;
        this.line = line;
        this.col = col;
        this.pos = pos;
    };
    JS_Parse_Error.prototype = Object.create(Error.prototype);
    JS_Parse_Error.prototype.constructor = JS_Parse_Error;
    JS_Parse_Error.prototype.name = "SyntaxError";
    configure_error_stack(JS_Parse_Error);

    /**
     * 抛出一个解析异常
     * @param {*} message
     * @param {*} filename
     * @param {*} line
     * @param {*} col
     * @param {*} pos
     */
    function js_error(message, filename, line, col, pos) {
        throw new JS_Parse_Error(message, filename, line, col, pos);
    };

    function is_token(token, type, val) {
        return token.type == type && (val == null || token.value == val);
    };

    var EX_EOF = {};

    /**
     * 词法分析器，创建一个读取token的函数，每次向前读取一个token
     * @param {string} $TEXT 代码字符串
     * @param {string} filename 文件名
     * @param {boolean} html5_comments 是否解析html5注释
     * @param {*} shebang
     */
    function tokenizer($TEXT, filename, html5_comments, shebang) {

        var S = {
            text            : $TEXT,
            filename        : filename,
            pos             : 0,    // 词法分析器当前解析的字符位置
            tokpos          : 0,    // token的第一个字符在代码中的位置
            line            : 1,
            tokline         : 0,
            col             : 0,
            tokcol          : 0,
            newline_before  : false,
            // 在某些符号或者关键字后边才能出现正则表达式！
            // 需要有标志位标记是否读取正则的token
            regex_allowed   : false,
            comments_before : [],
            directives      : {},
            directive_stack : []
        };

        /**
         * 返回当前位置的字符
         */
        function peek() { return S.text.charAt(S.pos); };

        /**
         * 读取当前字符，并将S状态更新：
         * S.pos,S.line,S.col,S.newline_before
         * .newline_before只有当处理的内容既不是作为字符串，当前S.newline_before为false时取false
         * @param {boolean} signal_eof 检测到换行符是否报错
         * @param {boolean} in_string 是否在处理字符串
         * @returns 当前字符
         */
        function next(signal_eof, in_string) {
            var ch = S.text.charAt(S.pos++);
            if (signal_eof && !ch)
                throw EX_EOF;
            if (NEWLINE_CHARS(ch)) {    // 如果是一个换行符
                // S.newline_before只有当处理的内容既不是作为字符串，S.newline_before为false是取false
                S.newline_before = S.newline_before || !in_string;
                // 行号更新
                ++S.line;
                // 列号清零
                S.col = 0;
                if (!in_string && ch == "\r" && peek() == "\n") {
                    // treat a \r\n sequence as a single \n
                    ++S.pos;
                    ch = "\n";
                }
            } else {
                ++S.col;
            }
            return ch;
        };

        /**
         * 向前跳过i个字符
         * @param {int} i 向前跳过的字符个数
         */
        function forward(i) {
            while (i-- > 0) next();
        };

        /**
         * 在代码文件中查找指定的子串，只判断是否查到
         * @param {string} str 寻找的字符串
         * @returns boolean
         */
        function looking_at(str) {
            return S.text.substr(S.pos, str.length) == str;
        };

        /**
         * 从当前位置开始查找下一个换行符
         * 返回换行符的位置，如果找不到返回-1
         */
        function find_eol() {
            var text = S.text;
            for (var i = S.pos, n = S.text.length; i < n; ++i) {
                var ch = text[i];
                if (NEWLINE_CHARS(ch))  // 判断是否为换行符
                    return i;
            }
            return -1;
        };

        /**
         * 在代码字串中从当前位置开始查找what子串
         * 返回查找到的首位置
         * @param {string} what 要查找的字符串
         * @param {boolean} signal_eof 没查找到时是否抛出异常
         * @returns int
         */
        function find(what, signal_eof) {
            var pos = S.text.indexOf(what, S.pos);
            if (signal_eof && pos == -1) throw EX_EOF;
            return pos;
        };

        /**
         * 开始读取token时对状态变量S进行一些初始化
         * 把当前的行号，列号，字符在代码文件中的位置赋值给token的对应信息
         */
        function start_token() {
            S.tokline = S.line;
            S.tokcol = S.col;
            S.tokpos = S.pos;
        };
        // 前一个字符是否是成员运算符'.'
        var prev_was_dot = false;

        /**
         * 创建一个AST_Token
         * @param {string} type token 类型
         * @param {string} value token的值
         * @param {boolean} is_comment 是否是注释
         */
        function token(type, value, is_comment) {
            // 判断是否允许正则表达式
            S.regex_allowed = ((type == "operator" && !UNARY_POSTFIX(value)) ||
                (type == "keyword" && KEYWORDS_BEFORE_EXPRESSION(value)) ||
                (type == "punc" && PUNC_BEFORE_EXPRESSION(value)));
            if (type == "punc" && value == ".") {
                prev_was_dot = true;
            } else if (!is_comment) {
                prev_was_dot = false;
            }
            // 读取token信息
            var ret = {
                type    : type,
                value   : value,
                line    : S.tokline,
                col     : S.tokcol,
                pos     : S.tokpos,
                endline : S.line,
                endcol  : S.col,
                endpos  : S.pos,
                nlb     : S.newline_before,
                file    : filename
            };
            if (/^(?:num|string|regexp)$/i.test(type)) {
                ret.raw = $TEXT.substring(ret.pos, ret.endpos);
            }
            if (!is_comment) {  //  如果该token不是注释，将token之前的注释保存到ret中
                //  将S状态变量中用于保存注释的域清空，并将其引用赋值给ret中保存token之后注释的域中
                ret.comments_before = S.comments_before;
                ret.comments_after = S.comments_before = [];
            }
            S.newline_before = false;
            return new AST_Token(ret);
        };

        /**
         * 跳过从当前位置开始的所有空白符
         * \r\n\t\f都属于空白符
         * 会更新S状态变量
         */
        function skip_whitespace() {
            while (WHITESPACE_CHARS(peek()))
                next();
        };

        /**
         * 创建一个读取循环，根据pred和当前字符ch决定循环是否结束
         * @param {Function} pred 字符读取循环函数
         */
        function read_while(pred) {
            var ret = "", ch, i = 0;
            while ((ch = peek()) && pred(ch, i++))
                ret += next();
            return ret;
        };

        /**
         * 创建一个解析异常
         * @param {string} err 错误消息
         */
        function parse_error(err) {
            js_error(err, filename, S.tokline, S.tokcol, S.tokpos);
        };

        /**
         * 解析数字字串
         * @param {char} prefix 数字前缀
         */
        function read_num(prefix) {
            var has_e = false, after_e = false, has_x = false, has_dot = prefix == ".";
            var num = read_while(function(ch, i){
                var code = ch.charCodeAt(0);
                switch (code) {
                    // 只能出现一个 xX
                    case 120: case 88: // xX
                    return has_x ? false : (has_x = true);
                    // 如果没有 xX，只能有一个 eE
                    case 101: case 69: // eE
                    return has_x ? true : has_e ? false : (has_e = after_e = true);
                    // 如果不是在 eE之后，且也不是第一个数字，没有前缀，则停止读取
                    case 45: // -
                        return after_e || (i == 0 && !prefix);
                    // + 只能出现在 eE后面
                    case 43: // +
                        return after_e;
                    // 小数点 . 只能出现在 xX eE之前，且只能有一个
                    case (after_e = false, 46): // .
                        return (!has_dot && !has_x && !has_e) ? (has_dot = true) : false;
                }
                // 只能是数字和字母
                return is_alphanumeric_char(code);
            });
            if (prefix) num = prefix + num;
            // 如果是八进制数字，且为严格模式，抛出异常
            if (RE_OCT_NUMBER.test(num) && next_token.has_directive("use strict")) {
                parse_error("Legacy octal literals are not allowed in strict mode");
            }
            var valid = parse_js_number(num);
            if (!isNaN(valid)) {
                // 如果数字合法，创建数字token
                return token("num", valid);
            } else {
                // 数字不合法，抛出异常
                parse_error("Invalid syntax: " + num);
            }
        };

        /**
         * 解析转义字符
         * @param {boolean} in_string 是否正在处理字符串
         */
        function read_escaped_char(in_string) {
            var ch = next(true, in_string);
            switch (ch.charCodeAt(0)) {
                case 110 : return "\n";
                case 114 : return "\r";
                case 116 : return "\t";
                case 98  : return "\b";
                case 118 : return "\u000b"; // \v
                case 102 : return "\f";
                case 120 : return String.fromCharCode(hex_bytes(2)); // \x
                case 117 : return String.fromCharCode(hex_bytes(4)); // \u 表示一个Unicode编码，解析后面的编码
                case 10  : return ""; // newline
                case 13  :            // \r
                    if (peek() == "\n") { // DOS newline
                        next(true, in_string);
                        return "";
                    }
            }
            if (ch >= "0" && ch <= "7")
            // 处理八进制转义字符
                return read_octal_escape_sequence(ch);
            return ch;
        };

        function read_octal_escape_sequence(ch) {
            // Read
            var p = peek();
            if (p >= "0" && p <= "7") {
                ch += next(true);
                if (ch[0] <= "3" && (p = peek()) >= "0" && p <= "7")
                    ch += next(true);
            }

            // Parse
            if (ch === "0") return "\0";
            if (ch.length > 0 && next_token.has_directive("use strict"))
                parse_error("Legacy octal escape sequences are not allowed in strict mode");
            return String.fromCharCode(parseInt(ch, 8));
        }

        /**
         * 读取n位16进制数，并转换为十进制整数
         * @param {int} n 16进制位数
         */
        function hex_bytes(n) {
            var num = 0;
            for (; n > 0; --n) {
                var digit = parseInt(next(true), 16);
                if (isNaN(digit))
                    parse_error("Invalid hex-character pattern in string");
                num = (num << 4) | digit;
            }
            return num;
        };

        /**
         * 创建一个具有异常处理的字符串解析函数
         * @returns string类型的token
         */
        var read_string = with_eof_error("Unterminated string constant", function(quote_char){
            // 读取当前的引号，并移动字符坐标
            var quote = next(), ret = "";
            // 处理字符串
            for (;;) {
                var ch = next(true, true);
                // 处理转义字符
                if (ch == "\\") ch = read_escaped_char(true);
                // 如果是换行符，抛出异常
                else if (NEWLINE_CHARS(ch)) parse_error("Unterminated string constant");
                // 匹配到另一个配对的引号，结束
                else if (ch == quote) break;
                ret += ch;
            }
            // 创建string 类型的token
            var tok = token("string", ret);
            tok.quote = quote_char;
            return tok;
        });

        /**
         * 解析注释，创建注释token，将其存放到S状态变量中
         * @param {string} type 注释类别字符串
         * @returns 返回值依旧是读取下一个token的函数
         */
        function skip_line_comment(type) {
            var regex_allowed = S.regex_allowed;
            // 查找下一个出现的换行符在代码中的位置pos
            var i = find_eol(), ret;
            if (i == -1) {  // 没有找到换行符
                ret = S.text.substr(S.pos); // 将从当前位置开始的余下字符串赋值给ret
                S.pos = S.text.length;  // 将词法分析处理的字符位置移动到字符串末尾
            } else {    // 如果找到换行符
                ret = S.text.substring(S.pos, i);   // 获取从当前位置到换行符的子串，不包含换行符
                S.pos = i;  //移动当前字符位置
            }
            // 更新当前的列号
            S.col = S.tokcol + (S.pos - S.tokpos);
            // 创建注释的token并将其存入S状态变量中用于保存token前注释的域中
            S.comments_before.push(token(type, ret, true));
            S.regex_allowed = regex_allowed;
            return next_token;
        };

        /**
         * 创建具有异常处理的多行注释解析函数
         */
        var skip_multiline_comment = with_eof_error("Unterminated multiline comment", function(){
            var regex_allowed = S.regex_allowed;
            //  查找从当前位置开始出现的首个"*/"，的第一个字符在代码中的位置pos
            var i = find("*/", true);
            var text = S.text.substring(S.pos, i).replace(/\r\n|\r|\u2028|\u2029/g, '\n');
            // update stream position
            forward(text.length /* doesn't count \r\n as 2 char while S.pos - i does */ + 2);
            S.comments_before.push(token("comment2", text, true));
            S.regex_allowed = regex_allowed;
            return next_token;
        });

        /**
         * 解析一个标识符
         * @returns 标识符字符串
         */
        function read_name() {
            var backslash = false, name = "", ch, escaped = false, hex;
            while ((ch = peek()) != null) { // 读取到非标识符字符或者字符串末尾结束
                if (!backslash) {
                    if (ch == "\\") escaped = backslash = true, next();
                    else if (is_identifier_char(ch)) name += next();
                    else break;
                }
                else {
                    // 反斜线'\'之后必须为字符'u'，表示一个Unicode编码，否则抛出异常
                    if (ch != "u") parse_error("Expecting UnicodeEscapeSequence -- uXXXX");
                    // 利用read_escaped_char()函数解析Unicode编码
                    ch = read_escaped_char();
                    // 如果该字符不符合标识符要求，抛出异常
                    if (!is_identifier_char(ch)) parse_error("Unicode char: " + ch.charCodeAt(0) + " is not valid in identifier");
                    name += ch;
                    backslash = false;
                }
            }
            // 如果是关键字
            if (KEYWORDS(name) && escaped) {
                hex = name.charCodeAt(0).toString(16).toUpperCase();
                name = "\\u" + "0000".substr(hex.length) + hex + name.slice(1);
            }
            return name;
        };

        var read_regexp = with_eof_error("Unterminated regular expression", function(source) {
            var prev_backslash = false, ch, in_class = false;
            while ((ch = next(true))) if (NEWLINE_CHARS(ch)) {
                parse_error("Unexpected line terminator");
            } else if (prev_backslash) {
                source += "\\" + ch;
                prev_backslash = false;
            } else if (ch == "[") {
                in_class = true;
                source += ch;
            } else if (ch == "]" && in_class) {
                in_class = false;
                source += ch;
            } else if (ch == "/" && !in_class) {
                break;
            } else if (ch == "\\") {
                prev_backslash = true;
            } else {
                source += ch;
            }
            var mods = read_name();
            try {
                var regexp = new RegExp(source, mods);
                regexp.raw_source = source;
                return token("regexp", regexp);
            } catch(e) {
                parse_error(e.message);
            }
        });

        function read_operator(prefix) {
            function grow(op) {
                if (!peek()) return op;
                var bigger = op + peek();
                if (OPERATORS(bigger)) {
                    next();
                    return grow(bigger);
                } else {
                    return op;
                }
            };
            return token("operator", grow(prefix || next()));
        };

        /**
         * 处理反斜线 "/"
         * 有可能是单行注释，多行注释开始
         * 也可能是正则匹配开始
         * 还可能是操作符
         */
        function handle_slash() {
            next();
            switch (peek()) {
                // 两个反斜线，行注释开头
                case "/":
                    next();
                    return skip_line_comment("comment1");
                // "/*"，块注释开头
                case "*":
                    next();
                    return skip_multiline_comment();
            }
            // 不是注释，则尝试正则匹配或者操作符
            return S.regex_allowed ? read_regexp("") : read_operator("/");
        };

        /**
         * 当遇到 . 时，处理方法
         */
        function handle_dot() {
            next();
            return is_digit(peek().charCodeAt(0))
                ? read_num(".") // 如果下一个字符是数字，则解析数字串
                : token("punc", ".");   // 否则直接判定 . 为一个标点符号，创建type为punc的token
        };

        /**
         * 解析一个符合标识符命名规则的子串，创建对应的token
         * @returns token
         */
        function read_word() {
            // 读取一个符合标识符命名规则的子串
            var word = read_name();
            // 如果该子串前面是一个成员运算符 "."，则创建一个type为name的token
            if (prev_was_dot) return token("name", word);
            // 判断子串的所属类型，标识符，运算符，关键字等。。。
            return KEYWORDS_ATOM(word) ? token("atom", word)
                : !KEYWORDS(word) ? token("name", word)
                    : OPERATORS(word) ? token("operator", word)
                        : token("keyword", word);
        };

        /**
         * 捕获目标函数抛出的不合理文件结束符异常
         * @param {Error} eof_error 文件末尾异常
         * @param {Function} cont 抛出异常的函数
         */
        function with_eof_error(eof_error, cont) {
            return function(x) {
                try {
                    return cont(x);
                } catch(ex) {
                    if (ex === EX_EOF) parse_error(eof_error);
                    else throw ex;
                }
            };
        };

        /**
         * 获取下一个token
         * @param {*} force_regexp
         */
        function next_token(force_regexp) {
            if (force_regexp != null)
                return read_regexp(force_regexp);
            // 解析shebang脚本
            if (shebang && S.pos == 0 && looking_at("#!")) {
                // shebang出现在脚本第一行，如果第一行一"#!"开始，则对后面的内容进行解析
                start_token();  //初始化
                forward(2);     //跳过两个字符，即是跳过"#!"
                skip_line_comment("comment5"); // 解析注释，创建注释token
            }
            for (;;) {
                // 跳过空白符
                skip_whitespace();
                // 初始化
                start_token();
                if (html5_comments) {   // 如果需要解析html5注释
                    if (looking_at("<!--")) {
                        forward(4);
                        skip_line_comment("comment3");
                        continue;
                    }
                    if (looking_at("-->") && S.newline_before) {
                        forward(3);
                        skip_line_comment("comment4");
                        continue;
                    }
                }
                // 读取当前字符
                var ch = peek();
                // 如果没有读取到字符，创建一个eof token并返回
                if (!ch) return token("eof");
                // 获取字符的Unicode
                var code = ch.charCodeAt(0);
                switch (code) {
                    // 双引号 " 和单引号 ' 判断
                    case 34: case 39: return read_string(ch);
                    // 成员运算符 "."
                    case 46: return handle_dot();
                    // 反斜杠 /
                    case 47: {
                        var tok = handle_slash();
                        // 如果是注释，则会返回next_token
                        if (tok === next_token) continue;
                        return tok;
                    }
                }
                // 数字
                if (is_digit(code)) return read_num();
                // 标点符号 "[]{}(),;:"
                if (PUNC_CHARS(ch)) return token("punc", next());
                // 操作符符号" +-*&%=<>!?|~^"
                if (OPERATOR_CHARS(ch)) return read_operator();
                // 如果是 "\"或者 符合标识符开头
                if (code == 92 || is_identifier_start(code)) return read_word();
                break;
            }
            parse_error("Unexpected character '" + ch + "'");
        };

        next_token.context = function(nc) {
            if (nc) S = nc;
            return S;
        };

        next_token.add_directive = function(directive) {
            S.directive_stack[S.directive_stack.length - 1].push(directive);

            if (S.directives[directive] === undefined) {
                S.directives[directive] = 1;
            } else {
                S.directives[directive]++;
            }
        }

        next_token.push_directives_stack = function() {
            S.directive_stack.push([]);
        }

        next_token.pop_directives_stack = function() {
            var directives = S.directive_stack[S.directive_stack.length - 1];

            for (var i = 0; i < directives.length; i++) {
                S.directives[directives[i]]--;
            }

            S.directive_stack.pop();
        }

        next_token.has_directive = function(directive) {
            return S.directives[directive] > 0;
        }

        return next_token;

    };

    /* -----[ Parser (constants) ]----- */

    var UNARY_PREFIX = makePredicate([
        "typeof",
        "void",
        "delete",
        "--",
        "++",
        "!",
        "~",
        "-",
        "+"
    ]);

    var UNARY_POSTFIX = makePredicate([ "--", "++" ]);

    var ASSIGNMENT = makePredicate([ "=", "+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=", "&=" ]);

    var PRECEDENCE = (function(a, ret){
        for (var i = 0; i < a.length; ++i) {
            var b = a[i];
            for (var j = 0; j < b.length; ++j) {
                ret[b[j]] = i + 1;
            }
        }
        return ret;
    })(
        [
            ["||"],
            ["&&"],
            ["|"],
            ["^"],
            ["&"],
            ["==", "===", "!=", "!=="],
            ["<", ">", "<=", ">=", "in", "instanceof"],
            [">>", "<<", ">>>"],
            ["+", "-"],
            ["*", "/", "%"]
        ],
        {}
    );

    var ATOMIC_START_TOKEN = makePredicate([ "atom", "num", "string", "regexp", "name" ]);

    /* -----[ Parser ]----- */

    function parse($TEXT, options) {

        options = defaults(options, {
            bare_returns   : false, //support top level return statements
            expression     : false, //Pass true to preserve completion values from terminal statements without return, e.g. in bookmarklets.
            filename       : null,
            html5_comments : true,
            shebang        : true,  //support #!command as the first line
            strict         : false,
            toplevel       : null,
        }, true);

        var S = {
            // 输入：可以自己构造一个token输入器传递进来 否则就用tokenizer返回的next_token作为输入器
            input         : (typeof $TEXT == "string"
                ? tokenizer($TEXT, options.filename,
                    options.html5_comments, options.shebang)
                : $TEXT),
            // 当前token
            token         : null,
            // 上一个token
            prev          : null,
            // 向前看一个token
            peeked        : null,
            // 函数嵌套层数
            in_function   : 0,
            // 在函数里边标记"use strict"这种指示性字符串
            in_directives : true,
            // 循环嵌套层数
            in_loop       : 0,
            // labels集合
            labels        : []
        };

        S.token = next();

        function is(type, value) {
            return is_token(S.token, type, value);
        };

        function peek() { return S.peeked || (S.peeked = S.input()); };

        /**
         * 获取下一个token
         */
        function next() {
            S.prev = S.token;
            if (S.peeked) {
                S.token = S.peeked;
                S.peeked = null;
            } else {
                S.token = S.input();
            }
            S.in_directives = S.in_directives && (
                S.token.type == "string" || is("punc", ";")
            );
            return S.token;
        };

        function prev() {
            return S.prev;
        };

        function croak(msg, line, col, pos) {
            var ctx = S.input.context();
            js_error(msg,
                ctx.filename,
                line != null ? line : ctx.tokline,
                col != null ? col : ctx.tokcol,
                pos != null ? pos : ctx.tokpos);
        };

        function token_error(token, msg) {
            croak(msg, token.line, token.col);
        };

        function unexpected(token) {
            if (token == null)
                token = S.token;
            token_error(token, "Unexpected token: " + token.type + " (" + token.value + ")");
        };

        function expect_token(type, val) {
            if (is(type, val)) {
                return next();
            }
            token_error(S.token, "Unexpected token " + S.token.type + " «" + S.token.value + "»" + ", expected " + type + " «" + val + "»");
        };

        function expect(punc) { return expect_token("punc", punc); };

        function has_newline_before(token) {
            return token.nlb || !all(token.comments_before, function(comment) {
                return !comment.nlb;
            });
        }

        function can_insert_semicolon() {
            return !options.strict
                && (is("eof") || is("punc", "}") || has_newline_before(S.token));
        };

        function semicolon(optional) {
            if (is("punc", ";")) next();
            else if (!optional && !can_insert_semicolon()) unexpected();
        };

        function parenthesised() {
            expect("(");
            var exp = expression(true);
            expect(")");
            return exp;
        };

        function embed_tokens(parser) {
            return function() {
                var start = S.token;
                var expr = parser();
                var end = prev();
                expr.start = start;
                expr.end = end;
                return expr;
            };
        };

        function handle_regexp() {
            if (is("operator", "/") || is("operator", "/=")) {
                S.peeked = null;
                S.token = S.input(S.token.value.substr(1)); // force regexp
            }
        };

        var statement = embed_tokens(function() {
            handle_regexp();
            switch (S.token.type) {
                case "string":
                    if (S.in_directives) {
                        var token = peek();
                        if (S.token.raw.indexOf("\\") == -1
                            && (is_token(token, "punc", ";")
                                || is_token(token, "punc", "}")
                                || has_newline_before(token)
                                || is_token(token, "eof"))) {
                            S.input.add_directive(S.token.value);
                        } else {
                            S.in_directives = false;
                        }
                    }
                    var dir = S.in_directives, stat = simple_statement();
                    return dir ? new AST_Directive(stat.body) : stat;
                case "num":
                case "regexp":
                case "operator":
                case "atom":
                    return simple_statement();

                case "name":
                    return is_token(peek(), "punc", ":")
                        ? labeled_statement()
                        : simple_statement();

                case "punc":
                    switch (S.token.value) {
                        case "{":
                            return new AST_BlockStatement({
                                start : S.token,
                                body  : block_(),
                                end   : prev()
                            });
                        case "[":
                        case "(":
                            return simple_statement();
                        case ";":
                            S.in_directives = false;
                            next();
                            return new AST_EmptyStatement();
                        default:
                            unexpected();
                    }

                case "keyword":
                    switch (S.token.value) {
                        case "break":
                            next();
                            return break_cont(AST_Break);

                        case "continue":
                            next();
                            return break_cont(AST_Continue);

                        case "debugger":
                            next();
                            semicolon();
                            return new AST_Debugger();

                        case "do":
                            next();
                            var body = in_loop(statement);
                            expect_token("keyword", "while");
                            var condition = parenthesised();
                            semicolon(true);
                            return new AST_Do({
                                body      : body,
                                condition : condition
                            });

                        case "while":
                            next();
                            return new AST_While({
                                condition : parenthesised(),
                                body      : in_loop(statement)
                            });

                        case "for":
                            next();
                            return for_();

                        case "function":
                            next();
                            return function_(AST_Defun);

                        case "if":
                            next();
                            return if_();

                        case "return":
                            if (S.in_function == 0 && !options.bare_returns)
                                croak("'return' outside of function");
                            next();
                            var value = null;
                            if (is("punc", ";")) {
                                next();
                            } else if (!can_insert_semicolon()) {
                                value = expression(true);
                                semicolon();
                            }
                            return new AST_Return({
                                value: value
                            });

                        case "switch":
                            next();
                            return new AST_Switch({
                                expression : parenthesised(),
                                body       : in_loop(switch_body_)
                            });

                        case "throw":
                            next();
                            if (has_newline_before(S.token))
                                croak("Illegal newline after 'throw'");
                            var value = expression(true);
                            semicolon();
                            return new AST_Throw({
                                value: value
                            });

                        case "try":
                            next();
                            return try_();

                        case "var":
                            next();
                            var node = var_();
                            semicolon();
                            return node;

                        case "with":
                            if (S.input.has_directive("use strict")) {
                                croak("Strict mode may not include a with statement");
                            }
                            next();
                            return new AST_With({
                                expression : parenthesised(),
                                body       : statement()
                            });
                    }
            }
            unexpected();
        });

        function labeled_statement() {
            var label = as_symbol(AST_Label);
            if (find_if(function(l){ return l.name == label.name }, S.labels)) {
                // ECMA-262, 12.12: An ECMAScript program is considered
                // syntactically incorrect if it contains a
                // LabelledStatement that is enclosed by a
                // LabelledStatement with the same Identifier as label.
                croak("Label " + label.name + " defined twice");
            }
            expect(":");
            S.labels.push(label);
            var stat = statement();
            S.labels.pop();
            if (!(stat instanceof AST_IterationStatement)) {
                // check for `continue` that refers to this label.
                // those should be reported as syntax errors.
                // https://github.com/mishoo/UglifyJS2/issues/287
                label.references.forEach(function(ref){
                    if (ref instanceof AST_Continue) {
                        ref = ref.label.start;
                        croak("Continue label `" + label.name + "` refers to non-IterationStatement.",
                            ref.line, ref.col, ref.pos);
                    }
                });
            }
            return new AST_LabeledStatement({ body: stat, label: label });
        };

        function simple_statement(tmp) {
            return new AST_SimpleStatement({ body: (tmp = expression(true), semicolon(), tmp) });
        };

        function break_cont(type) {
            var label = null, ldef;
            if (!can_insert_semicolon()) {
                label = as_symbol(AST_LabelRef, true);
            }
            if (label != null) {
                ldef = find_if(function(l){ return l.name == label.name }, S.labels);
                if (!ldef)
                    croak("Undefined label " + label.name);
                label.thedef = ldef;
            }
            else if (S.in_loop == 0)
                croak(type.TYPE + " not inside a loop or switch");
            semicolon();
            var stat = new type({ label: label });
            if (ldef) ldef.references.push(stat);
            return stat;
        };

        function for_() {
            expect("(");
            var init = null;
            if (!is("punc", ";")) {
                init = is("keyword", "var")
                    ? (next(), var_(true))
                    : expression(true, true);
                if (is("operator", "in")) {
                    if (init instanceof AST_Var) {
                        if (init.definitions.length > 1)
                            croak("Only one variable declaration allowed in for..in loop", init.start.line, init.start.col, init.start.pos);
                    } else if (!is_assignable(init)) {
                        croak("Invalid left-hand side in for..in loop", init.start.line, init.start.col, init.start.pos);
                    }
                    next();
                    return for_in(init);
                }
            }
            return regular_for(init);
        };

        function regular_for(init) {
            expect(";");
            var test = is("punc", ";") ? null : expression(true);
            expect(";");
            var step = is("punc", ")") ? null : expression(true);
            expect(")");
            return new AST_For({
                init      : init,
                condition : test,
                step      : step,
                body      : in_loop(statement)
            });
        };

        function for_in(init) {
            var lhs = init instanceof AST_Var ? init.definitions[0].name : null;
            var obj = expression(true);
            expect(")");
            return new AST_ForIn({
                init   : init,
                name   : lhs,
                object : obj,
                body   : in_loop(statement)
            });
        };

        var function_ = function(ctor) {
            var in_statement = ctor === AST_Defun;
            var name = is("name") ? as_symbol(in_statement ? AST_SymbolDefun : AST_SymbolLambda) : null;
            if (in_statement && !name)
                unexpected();
            if (name && ctor !== AST_Accessor && !(name instanceof AST_SymbolDeclaration))
                unexpected(prev());
            expect("(");
            var argnames = [];
            for (var first = true; !is("punc", ")");) {
                if (first) first = false; else expect(",");
                argnames.push(as_symbol(AST_SymbolFunarg));
            }
            next();
            var loop = S.in_loop;
            var labels = S.labels;
            ++S.in_function;
            S.in_directives = true;
            S.input.push_directives_stack();
            S.in_loop = 0;
            S.labels = [];
            var body = block_();
            if (S.input.has_directive("use strict")) {
                if (name) strict_verify_symbol(name);
                argnames.forEach(strict_verify_symbol);
            }
            S.input.pop_directives_stack();
            --S.in_function;
            S.in_loop = loop;
            S.labels = labels;
            return new ctor({
                name: name,
                argnames: argnames,
                body: body
            });
        };

        function if_() {
            var cond = parenthesised(), body = statement(), belse = null;
            if (is("keyword", "else")) {
                next();
                belse = statement();
            }
            return new AST_If({
                condition   : cond,
                body        : body,
                alternative : belse
            });
        };

        function block_() {
            expect("{");
            var a = [];
            while (!is("punc", "}")) {
                if (is("eof")) unexpected();
                a.push(statement());
            }
            next();
            return a;
        };

        function switch_body_() {
            expect("{");
            var a = [], cur = null, branch = null, tmp;
            while (!is("punc", "}")) {
                if (is("eof")) unexpected();
                if (is("keyword", "case")) {
                    if (branch) branch.end = prev();
                    cur = [];
                    branch = new AST_Case({
                        start      : (tmp = S.token, next(), tmp),
                        expression : expression(true),
                        body       : cur
                    });
                    a.push(branch);
                    expect(":");
                }
                else if (is("keyword", "default")) {
                    if (branch) branch.end = prev();
                    cur = [];
                    branch = new AST_Default({
                        start : (tmp = S.token, next(), expect(":"), tmp),
                        body  : cur
                    });
                    a.push(branch);
                }
                else {
                    if (!cur) unexpected();
                    cur.push(statement());
                }
            }
            if (branch) branch.end = prev();
            next();
            return a;
        };

        function try_() {
            var body = block_(), bcatch = null, bfinally = null;
            if (is("keyword", "catch")) {
                var start = S.token;
                next();
                expect("(");
                var name = as_symbol(AST_SymbolCatch);
                expect(")");
                bcatch = new AST_Catch({
                    start   : start,
                    argname : name,
                    body    : block_(),
                    end     : prev()
                });
            }
            if (is("keyword", "finally")) {
                var start = S.token;
                next();
                bfinally = new AST_Finally({
                    start : start,
                    body  : block_(),
                    end   : prev()
                });
            }
            if (!bcatch && !bfinally)
                croak("Missing catch/finally blocks");
            return new AST_Try({
                body     : body,
                bcatch   : bcatch,
                bfinally : bfinally
            });
        };

        function vardefs(no_in) {
            var a = [];
            for (;;) {
                a.push(new AST_VarDef({
                    start : S.token,
                    name  : as_symbol(AST_SymbolVar),
                    value : is("operator", "=") ? (next(), expression(false, no_in)) : null,
                    end   : prev()
                }));
                if (!is("punc", ","))
                    break;
                next();
            }
            return a;
        };

        var var_ = function(no_in) {
            return new AST_Var({
                start       : prev(),
                definitions : vardefs(no_in),
                end         : prev()
            });
        };

        var new_ = function(allow_calls) {
            var start = S.token;
            expect_token("operator", "new");
            var newexp = expr_atom(false), args;
            if (is("punc", "(")) {
                next();
                args = expr_list(")");
            } else {
                args = [];
            }
            return subscripts(new AST_New({
                start      : start,
                expression : newexp,
                args       : args,
                end        : prev()
            }), allow_calls);
        };

        function as_atom_node() {
            var tok = S.token, ret;
            switch (tok.type) {
                case "name":
                    ret = _make_symbol(AST_SymbolRef);
                    break;
                case "num":
                    ret = new AST_Number({ start: tok, end: tok, value: tok.value });
                    break;
                case "string":
                    ret = new AST_String({
                        start : tok,
                        end   : tok,
                        value : tok.value,
                        quote : tok.quote
                    });
                    break;
                case "regexp":
                    ret = new AST_RegExp({ start: tok, end: tok, value: tok.value });
                    break;
                case "atom":
                    switch (tok.value) {
                        case "false":
                            ret = new AST_False({ start: tok, end: tok });
                            break;
                        case "true":
                            ret = new AST_True({ start: tok, end: tok });
                            break;
                        case "null":
                            ret = new AST_Null({ start: tok, end: tok });
                            break;
                    }
                    break;
            }
            next();
            return ret;
        };

        var expr_atom = function(allow_calls) {
            if (is("operator", "new")) {
                return new_(allow_calls);
            }
            var start = S.token;
            if (is("punc")) {
                switch (start.value) {
                    case "(":
                        next();
                        var ex = expression(true);
                        var len = start.comments_before.length;
                        [].unshift.apply(ex.start.comments_before, start.comments_before);
                        start.comments_before = ex.start.comments_before;
                        start.comments_before_length = len;
                        if (len == 0 && start.comments_before.length > 0) {
                            var comment = start.comments_before[0];
                            if (!comment.nlb) {
                                comment.nlb = start.nlb;
                                start.nlb = false;
                            }
                        }
                        start.comments_after = ex.start.comments_after;
                        ex.start = start;
                        expect(")");
                        var end = prev();
                        end.comments_before = ex.end.comments_before;
                        [].push.apply(ex.end.comments_after, end.comments_after);
                        end.comments_after = ex.end.comments_after;
                        ex.end = end;
                        if (ex instanceof AST_Call) mark_pure(ex);
                        return subscripts(ex, allow_calls);
                    case "[":
                        return subscripts(array_(), allow_calls);
                    case "{":
                        return subscripts(object_(), allow_calls);
                }
                unexpected();
            }
            if (is("keyword", "function")) {
                next();
                var func = function_(AST_Function);
                func.start = start;
                func.end = prev();
                return subscripts(func, allow_calls);
            }
            if (ATOMIC_START_TOKEN(S.token.type)) {
                return subscripts(as_atom_node(), allow_calls);
            }
            unexpected();
        };

        function expr_list(closing, allow_trailing_comma, allow_empty) {
            var first = true, a = [];
            while (!is("punc", closing)) {
                if (first) first = false; else expect(",");
                if (allow_trailing_comma && is("punc", closing)) break;
                if (is("punc", ",") && allow_empty) {
                    a.push(new AST_Hole({ start: S.token, end: S.token }));
                } else {
                    a.push(expression(false));
                }
            }
            next();
            return a;
        };

        var array_ = embed_tokens(function() {
            expect("[");
            return new AST_Array({
                elements: expr_list("]", !options.strict, true)
            });
        });

        var create_accessor = embed_tokens(function() {
            return function_(AST_Accessor);
        });

        var object_ = embed_tokens(function() {
            expect("{");
            var first = true, a = [];
            while (!is("punc", "}")) {
                if (first) first = false; else expect(",");
                if (!options.strict && is("punc", "}"))
                // allow trailing comma
                    break;
                var start = S.token;
                var type = start.type;
                var name = as_property_name();
                if (type == "name" && !is("punc", ":")) {
                    var key = new AST_SymbolAccessor({
                        start: S.token,
                        name: as_property_name(),
                        end: prev()
                    });
                    if (name == "get") {
                        a.push(new AST_ObjectGetter({
                            start : start,
                            key   : key,
                            value : create_accessor(),
                            end   : prev()
                        }));
                        continue;
                    }
                    if (name == "set") {
                        a.push(new AST_ObjectSetter({
                            start : start,
                            key   : key,
                            value : create_accessor(),
                            end   : prev()
                        }));
                        continue;
                    }
                }
                expect(":");
                a.push(new AST_ObjectKeyVal({
                    start : start,
                    quote : start.quote,
                    key   : name,
                    value : expression(false),
                    end   : prev()
                }));
            }
            next();
            return new AST_Object({ properties: a });
        });

        function as_property_name() {
            var tmp = S.token;
            switch (tmp.type) {
                case "operator":
                    if (!KEYWORDS(tmp.value)) unexpected();
                case "num":
                case "string":
                case "name":
                case "keyword":
                case "atom":
                    next();
                    return tmp.value;
                default:
                    unexpected();
            }
        };

        function as_name() {
            var tmp = S.token;
            if (tmp.type != "name") unexpected();
            next();
            return tmp.value;
        };

        function _make_symbol(type) {
            var name = S.token.value;
            return new (name == "this" ? AST_This : type)({
                name  : String(name),
                start : S.token,
                end   : S.token
            });
        };

        function strict_verify_symbol(sym) {
            if (sym.name == "arguments" || sym.name == "eval")
                croak("Unexpected " + sym.name + " in strict mode", sym.start.line, sym.start.col, sym.start.pos);
        }

        function as_symbol(type, noerror) {
            if (!is("name")) {
                if (!noerror) croak("Name expected");
                return null;
            }
            var sym = _make_symbol(type);
            if (S.input.has_directive("use strict") && sym instanceof AST_SymbolDeclaration) {
                strict_verify_symbol(sym);
            }
            next();
            return sym;
        };

        function mark_pure(call) {
            var start = call.start;
            var comments = start.comments_before;
            var i = HOP(start, "comments_before_length") ? start.comments_before_length : comments.length;
            while (--i >= 0) {
                var comment = comments[i];
                if (/[@#]__PURE__/.test(comment.value)) {
                    call.pure = comment;
                    break;
                }
            }
        }

        var subscripts = function(expr, allow_calls) {
            var start = expr.start;
            if (is("punc", ".")) {
                next();
                return subscripts(new AST_Dot({
                    start      : start,
                    expression : expr,
                    property   : as_name(),
                    end        : prev()
                }), allow_calls);
            }
            if (is("punc", "[")) {
                next();
                var prop = expression(true);
                expect("]");
                return subscripts(new AST_Sub({
                    start      : start,
                    expression : expr,
                    property   : prop,
                    end        : prev()
                }), allow_calls);
            }
            if (allow_calls && is("punc", "(")) {
                next();
                var call = new AST_Call({
                    start      : start,
                    expression : expr,
                    args       : expr_list(")"),
                    end        : prev()
                });
                mark_pure(call);
                return subscripts(call, true);
            }
            return expr;
        };

        var maybe_unary = function(allow_calls) {
            var start = S.token;
            if (is("operator") && UNARY_PREFIX(start.value)) {
                next();
                handle_regexp();
                var ex = make_unary(AST_UnaryPrefix, start, maybe_unary(allow_calls));
                ex.start = start;
                ex.end = prev();
                return ex;
            }
            var val = expr_atom(allow_calls);
            while (is("operator") && UNARY_POSTFIX(S.token.value) && !has_newline_before(S.token)) {
                val = make_unary(AST_UnaryPostfix, S.token, val);
                val.start = start;
                val.end = S.token;
                next();
            }
            return val;
        };

        function make_unary(ctor, token, expr) {
            var op = token.value;
            switch (op) {
                case "++":
                case "--":
                    if (!is_assignable(expr))
                        croak("Invalid use of " + op + " operator", token.line, token.col, token.pos);
                    break;
                case "delete":
                    if (expr instanceof AST_SymbolRef && S.input.has_directive("use strict"))
                        croak("Calling delete on expression not allowed in strict mode", expr.start.line, expr.start.col, expr.start.pos);
                    break;
            }
            return new ctor({ operator: op, expression: expr });
        };

        var expr_op = function(left, min_prec, no_in) {
            var op = is("operator") ? S.token.value : null;
            if (op == "in" && no_in) op = null;
            var prec = op != null ? PRECEDENCE[op] : null;
            if (prec != null && prec > min_prec) {
                next();
                var right = expr_op(maybe_unary(true), prec, no_in);
                return expr_op(new AST_Binary({
                    start    : left.start,
                    left     : left,
                    operator : op,
                    right    : right,
                    end      : right.end
                }), min_prec, no_in);
            }
            return left;
        };

        function expr_ops(no_in) {
            return expr_op(maybe_unary(true), 0, no_in);
        };

        var maybe_conditional = function(no_in) {
            var start = S.token;
            var expr = expr_ops(no_in);
            if (is("operator", "?")) {
                next();
                var yes = expression(false);
                expect(":");
                return new AST_Conditional({
                    start       : start,
                    condition   : expr,
                    consequent  : yes,
                    alternative : expression(false, no_in),
                    end         : prev()
                });
            }
            return expr;
        };

        function is_assignable(expr) {
            return expr instanceof AST_PropAccess || expr instanceof AST_SymbolRef;
        };

        var maybe_assign = function(no_in) {
            var start = S.token;
            var left = maybe_conditional(no_in), val = S.token.value;
            if (is("operator") && ASSIGNMENT(val)) {
                if (is_assignable(left)) {
                    next();
                    return new AST_Assign({
                        start    : start,
                        left     : left,
                        operator : val,
                        right    : maybe_assign(no_in),
                        end      : prev()
                    });
                }
                croak("Invalid assignment");
            }
            return left;
        };

        var expression = function(commas, no_in) {
            var start = S.token;
            var exprs = [];
            while (true) {
                exprs.push(maybe_assign(no_in));
                if (!commas || !is("punc", ",")) break;
                next();
                commas = true;
            }
            return exprs.length == 1 ? exprs[0] : new AST_Sequence({
                start       : start,
                expressions : exprs,
                end         : peek()
            });
        };

        function in_loop(cont) {
            ++S.in_loop;
            var ret = cont();
            --S.in_loop;
            return ret;
        };

        if (options.expression) {
            return expression(true);
        }

        return (function(){
            // 在前面已经调用next()函数解析第一个token
            var start = S.token;
            var body = [];
            S.input.push_directives_stack();
            while (!is("eof"))
                body.push(statement());
            S.input.pop_directives_stack();
            var end = prev();
            var toplevel = options.toplevel;
            if (toplevel) {
                toplevel.body = toplevel.body.concat(body);
                toplevel.end = end;
            } else {
                toplevel = new AST_Toplevel({ start: start, body: body, end: end });
            }
            return toplevel;
        })();

    };


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

// Tree transformer helpers.

    function TreeTransformer(before, after) {
        TreeWalker.call(this);
        this.before = before;
        this.after = after;
    }
    TreeTransformer.prototype = new TreeWalker;

    (function(undefined){

        function _(node, descend) {
            node.DEFMETHOD("transform", function(tw, in_list){
                var x, y;
                tw.push(this);
                if (tw.before) x = tw.before(this, descend, in_list);
                if (x === undefined) {
                    x = this;
                    descend(x, tw);
                    if (tw.after) {
                        y = tw.after(x, in_list);
                        if (y !== undefined) x = y;
                    }
                }
                tw.pop();
                return x;
            });
        };

        function do_list(list, tw) {
            return MAP(list, function(node){
                return node.transform(tw, true);
            });
        };

        _(AST_Node, noop);

        _(AST_LabeledStatement, function(self, tw){
            self.label = self.label.transform(tw);
            self.body = self.body.transform(tw);
        });

        _(AST_SimpleStatement, function(self, tw){
            self.body = self.body.transform(tw);
        });

        _(AST_Block, function(self, tw){
            self.body = do_list(self.body, tw);
        });

        _(AST_DWLoop, function(self, tw){
            self.condition = self.condition.transform(tw);
            self.body = self.body.transform(tw);
        });

        _(AST_For, function(self, tw){
            if (self.init) self.init = self.init.transform(tw);
            if (self.condition) self.condition = self.condition.transform(tw);
            if (self.step) self.step = self.step.transform(tw);
            self.body = self.body.transform(tw);
        });

        _(AST_ForIn, function(self, tw){
            self.init = self.init.transform(tw);
            self.object = self.object.transform(tw);
            self.body = self.body.transform(tw);
        });

        _(AST_With, function(self, tw){
            self.expression = self.expression.transform(tw);
            self.body = self.body.transform(tw);
        });

        _(AST_Exit, function(self, tw){
            if (self.value) self.value = self.value.transform(tw);
        });

        _(AST_LoopControl, function(self, tw){
            if (self.label) self.label = self.label.transform(tw);
        });

        _(AST_If, function(self, tw){
            self.condition = self.condition.transform(tw);
            self.body = self.body.transform(tw);
            if (self.alternative) self.alternative = self.alternative.transform(tw);
        });

        _(AST_Switch, function(self, tw){
            self.expression = self.expression.transform(tw);
            self.body = do_list(self.body, tw);
        });

        _(AST_Case, function(self, tw){
            self.expression = self.expression.transform(tw);
            self.body = do_list(self.body, tw);
        });

        _(AST_Try, function(self, tw){
            self.body = do_list(self.body, tw);
            if (self.bcatch) self.bcatch = self.bcatch.transform(tw);
            if (self.bfinally) self.bfinally = self.bfinally.transform(tw);
        });

        _(AST_Catch, function(self, tw){
            self.argname = self.argname.transform(tw);
            self.body = do_list(self.body, tw);
        });

        _(AST_Definitions, function(self, tw){
            self.definitions = do_list(self.definitions, tw);
        });

        _(AST_VarDef, function(self, tw){
            self.name = self.name.transform(tw);
            if (self.value) self.value = self.value.transform(tw);
        });

        _(AST_Lambda, function(self, tw){
            if (self.name) self.name = self.name.transform(tw);
            self.argnames = do_list(self.argnames, tw);
            self.body = do_list(self.body, tw);
        });

        _(AST_Call, function(self, tw){
            self.expression = self.expression.transform(tw);
            self.args = do_list(self.args, tw);
        });

        _(AST_Sequence, function(self, tw){
            self.expressions = do_list(self.expressions, tw);
        });

        _(AST_Dot, function(self, tw){
            self.expression = self.expression.transform(tw);
        });

        _(AST_Sub, function(self, tw){
            self.expression = self.expression.transform(tw);
            self.property = self.property.transform(tw);
        });

        _(AST_Unary, function(self, tw){
            self.expression = self.expression.transform(tw);
        });

        _(AST_Binary, function(self, tw){
            self.left = self.left.transform(tw);
            self.right = self.right.transform(tw);
        });

        _(AST_Conditional, function(self, tw){
            self.condition = self.condition.transform(tw);
            self.consequent = self.consequent.transform(tw);
            self.alternative = self.alternative.transform(tw);
        });

        _(AST_Array, function(self, tw){
            self.elements = do_list(self.elements, tw);
        });

        _(AST_Object, function(self, tw){
            self.properties = do_list(self.properties, tw);
        });

        _(AST_ObjectProperty, function(self, tw){
            self.value = self.value.transform(tw);
        });

    })();


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    function SymbolDef(scope, orig) {
        this.name = orig.name;
        this.orig = [ orig ];
        this.eliminated = 0;
        this.scope = scope;
        this.references = [];
        this.replaced = 0;
        this.global = false;
        this.mangled_name = null;
        this.undeclared = false;
        this.id = SymbolDef.next_id++;
    };

    SymbolDef.next_id = 1;

    SymbolDef.prototype = {
        unmangleable: function(options) {
            if (!options) options = {};

            return (this.global && !options.toplevel)
                || this.undeclared
                || (!options.eval && (this.scope.uses_eval || this.scope.uses_with))
                || (options.keep_fnames
                    && (this.orig[0] instanceof AST_SymbolLambda
                        || this.orig[0] instanceof AST_SymbolDefun));
        },
        mangle: function(options) {
            var cache = options.cache && options.cache.props;
            if (this.global && cache && cache.has(this.name)) {
                this.mangled_name = cache.get(this.name);
            }
            else if (!this.mangled_name && !this.unmangleable(options)) {
                var s = this.scope;
                var sym = this.orig[0];
                if (options.ie8 && sym instanceof AST_SymbolLambda)
                    s = s.parent_scope;
                var def;
                if (def = this.redefined()) {
                    this.mangled_name = def.mangled_name || def.name;
                } else
                    this.mangled_name = s.next_mangled(options, this);
                if (this.global && cache) {
                    cache.set(this.name, this.mangled_name);
                }
            }
        },
        redefined: function() {
            return this.defun && this.defun.variables.get(this.name);
        }
    };

    AST_Toplevel.DEFMETHOD("figure_out_scope", function(options){
        options = defaults(options, {
            cache: null,
            ie8: false,
        });

        // pass 1: setup scope chaining and handle definitions
        var self = this;
        var scope = self.parent_scope = null;
        var labels = new Dictionary();
        var defun = null;
        var tw = new TreeWalker(function(node, descend){
            if (node instanceof AST_Catch) {
                var save_scope = scope;
                scope = new AST_Scope(node);
                scope.init_scope_vars(save_scope);
                descend();
                scope = save_scope;
                return true;
            }
            if (node instanceof AST_Scope) {
                node.init_scope_vars(scope);
                var save_scope = scope;
                var save_defun = defun;
                var save_labels = labels;
                defun = scope = node;
                labels = new Dictionary();
                descend();
                scope = save_scope;
                defun = save_defun;
                labels = save_labels;
                return true;        // don't descend again in TreeWalker
            }
            if (node instanceof AST_LabeledStatement) {
                var l = node.label;
                if (labels.has(l.name)) {
                    throw new Error(string_template("Label {name} defined twice", l));
                }
                labels.set(l.name, l);
                descend();
                labels.del(l.name);
                return true;        // no descend again
            }
            if (node instanceof AST_With) {
                for (var s = scope; s; s = s.parent_scope)
                    s.uses_with = true;
                return;
            }
            if (node instanceof AST_Symbol) {
                node.scope = scope;
            }
            if (node instanceof AST_Label) {
                node.thedef = node;
                node.references = [];
            }
            if (node instanceof AST_SymbolLambda) {
                defun.def_function(node);
            }
            else if (node instanceof AST_SymbolDefun) {
                // Careful here, the scope where this should be defined is
                // the parent scope.  The reason is that we enter a new
                // scope when we encounter the AST_Defun node (which is
                // instanceof AST_Scope) but we get to the symbol a bit
                // later.
                (node.scope = defun.parent_scope).def_function(node);
            }
            else if (node instanceof AST_SymbolVar) {
                defun.def_variable(node);
                if (defun !== scope) {
                    node.mark_enclosed(options);
                    var def = scope.find_variable(node);
                    if (node.thedef !== def) {
                        node.thedef = def;
                        node.reference(options);
                    }
                }
            }
            else if (node instanceof AST_SymbolCatch) {
                scope.def_variable(node).defun = defun;
            }
            else if (node instanceof AST_LabelRef) {
                var sym = labels.get(node.name);
                if (!sym) throw new Error(string_template("Undefined label {name} [{line},{col}]", {
                    name: node.name,
                    line: node.start.line,
                    col: node.start.col
                }));
                node.thedef = sym;
            }
        });
        self.walk(tw);

        // pass 2: find back references and eval
        self.globals = new Dictionary();
        var tw = new TreeWalker(function(node, descend){
            if (node instanceof AST_LoopControl && node.label) {
                node.label.thedef.references.push(node);
                return true;
            }
            if (node instanceof AST_SymbolRef) {
                var name = node.name;
                if (name == "eval" && tw.parent() instanceof AST_Call) {
                    for (var s = node.scope; s && !s.uses_eval; s = s.parent_scope) {
                        s.uses_eval = true;
                    }
                }
                var sym = node.scope.find_variable(name);
                if (!sym) {
                    sym = self.def_global(node);
                } else if (sym.scope instanceof AST_Lambda && name == "arguments") {
                    sym.scope.uses_arguments = true;
                }
                node.thedef = sym;
                node.reference(options);
                return true;
            }
            // ensure mangling works if catch reuses a scope variable
            var def;
            if (node instanceof AST_SymbolCatch && (def = node.definition().redefined())) {
                var s = node.scope;
                while (s) {
                    push_uniq(s.enclosed, def);
                    if (s === def.scope) break;
                    s = s.parent_scope;
                }
            }
        });
        self.walk(tw);

        // pass 3: fix up any scoping issue with IE8
        if (options.ie8) {
            self.walk(new TreeWalker(function(node, descend) {
                if (node instanceof AST_SymbolCatch) {
                    var name = node.name;
                    var refs = node.thedef.references;
                    var scope = node.thedef.defun;
                    var def = scope.find_variable(name) || self.globals.get(name) || scope.def_variable(node);
                    refs.forEach(function(ref) {
                        ref.thedef = def;
                        ref.reference(options);
                    });
                    node.thedef = def;
                    node.reference(options);
                    return true;
                }
            }));
        }

        if (options.cache) {
            this.cname = options.cache.cname;
        }
    });

    AST_Toplevel.DEFMETHOD("def_global", function(node){
        var globals = this.globals, name = node.name;
        if (globals.has(name)) {
            return globals.get(name);
        } else {
            var g = new SymbolDef(this, node);
            g.undeclared = true;
            g.global = true;
            globals.set(name, g);
            return g;
        }
    });

    AST_Scope.DEFMETHOD("init_scope_vars", function(parent_scope){
        this.variables = new Dictionary();  // map name to AST_SymbolVar (variables defined in this scope; includes functions)
        this.functions = new Dictionary();  // map name to AST_SymbolDefun (functions defined in this scope)
        this.uses_with = false;             // will be set to true if this or some nested scope uses the `with` statement
        this.uses_eval = false;             // will be set to true if this or nested scope uses the global `eval`
        this.parent_scope = parent_scope;   // the parent scope
        this.enclosed = [];                 // a list of variables from this or outer scope(s) that are referenced from this or inner scopes
        this.cname = -1;                    // the current index for mangling functions/variables
    });

    AST_Lambda.DEFMETHOD("init_scope_vars", function(){
        AST_Scope.prototype.init_scope_vars.apply(this, arguments);
        this.uses_arguments = false;
        this.def_variable(new AST_SymbolFunarg({
            name: "arguments",
            start: this.start,
            end: this.end
        }));
    });

    AST_Symbol.DEFMETHOD("mark_enclosed", function(options) {
        var def = this.definition();
        var s = this.scope;
        while (s) {
            push_uniq(s.enclosed, def);
            if (options.keep_fnames) {
                s.functions.each(function(d) {
                    push_uniq(def.scope.enclosed, d);
                });
            }
            if (s === def.scope) break;
            s = s.parent_scope;
        }
    });

    AST_Symbol.DEFMETHOD("reference", function(options) {
        this.definition().references.push(this);
        this.mark_enclosed(options);
    });

    AST_Scope.DEFMETHOD("find_variable", function(name){
        if (name instanceof AST_Symbol) name = name.name;
        return this.variables.get(name)
            || (this.parent_scope && this.parent_scope.find_variable(name));
    });

    AST_Scope.DEFMETHOD("def_function", function(symbol){
        var def = this.def_variable(symbol);
        this.functions.set(symbol.name, def);
        return def;
    });

    AST_Scope.DEFMETHOD("def_variable", function(symbol){
        var def;
        if (!this.variables.has(symbol.name)) {
            def = new SymbolDef(this, symbol);
            this.variables.set(symbol.name, def);
            def.global = !this.parent_scope;
        } else {
            def = this.variables.get(symbol.name);
            def.orig.push(symbol);
        }
        return symbol.thedef = def;
    });

    AST_Scope.DEFMETHOD("next_mangled", function(options){
        var ext = this.enclosed;
        out: while (true) {
            var m = base54(++this.cname);
            if (!is_identifier(m)) continue; // skip over "do"

            // https://github.com/mishoo/UglifyJS2/issues/242 -- do not
            // shadow a name reserved from mangling.
            if (member(m, options.reserved)) continue;

            // we must ensure that the mangled name does not shadow a name
            // from some parent scope that is referenced in this or in
            // inner scopes.
            for (var i = ext.length; --i >= 0;) {
                var sym = ext[i];
                var name = sym.mangled_name || (sym.unmangleable(options) && sym.name);
                if (m == name) continue out;
            }
            return m;
        }
    });

    AST_Function.DEFMETHOD("next_mangled", function(options, def){
        // #179, #326
        // in Safari strict mode, something like (function x(x){...}) is a syntax error;
        // a function expression's argument cannot shadow the function expression's name

        var tricky_def = def.orig[0] instanceof AST_SymbolFunarg && this.name && this.name.definition();

        // the function's mangled_name is null when keep_fnames is true
        var tricky_name = tricky_def ? tricky_def.mangled_name || tricky_def.name : null;

        while (true) {
            var name = AST_Lambda.prototype.next_mangled.call(this, options, def);
            if (!tricky_name || tricky_name != name)
                return name;
        }
    });

    AST_Symbol.DEFMETHOD("unmangleable", function(options){
        var def = this.definition();
        return !def || def.unmangleable(options);
    });

// labels are always mangleable
    AST_Label.DEFMETHOD("unmangleable", return_false);

    AST_Symbol.DEFMETHOD("unreferenced", function(){
        return this.definition().references.length == 0
            && !(this.scope.uses_eval || this.scope.uses_with);
    });

    AST_Symbol.DEFMETHOD("definition", function(){
        return this.thedef;
    });

    AST_Symbol.DEFMETHOD("global", function(){
        return this.definition().global;
    });

    AST_Toplevel.DEFMETHOD("_default_mangler_options", function(options) {
        options = defaults(options, {
            eval        : false,
            ie8         : false,
            keep_fnames : false,
            reserved    : [],
            toplevel    : false,
        });
        if (!Array.isArray(options.reserved)) options.reserved = [];
        // Never mangle arguments
        push_uniq(options.reserved, "arguments");
        return options;
    });

    AST_Toplevel.DEFMETHOD("mangle_names", function(options){
        options = this._default_mangler_options(options);

        // We only need to mangle declaration nodes.  Special logic wired
        // into the code generator will display the mangled name if it's
        // present (and for AST_SymbolRef-s it'll use the mangled name of
        // the AST_SymbolDeclaration that it points to).
        var lname = -1;
        var to_mangle = [];

        if (options.cache) {
            this.globals.each(collect);
        }

        var tw = new TreeWalker(function(node, descend){
            if (node instanceof AST_LabeledStatement) {
                // lname is incremented when we get to the AST_Label
                var save_nesting = lname;
                descend();
                lname = save_nesting;
                return true;        // don't descend again in TreeWalker
            }
            if (node instanceof AST_Scope) {
                node.variables.each(collect);
                return;
            }
            if (node instanceof AST_Label) {
                var name;
                do name = base54(++lname); while (!is_identifier(name));
                node.mangled_name = name;
                return true;
            }
            if (!options.ie8 && node instanceof AST_SymbolCatch) {
                to_mangle.push(node.definition());
                return;
            }
        });
        this.walk(tw);
        to_mangle.forEach(function(def){ def.mangle(options) });

        if (options.cache) {
            options.cache.cname = this.cname;
        }

        function collect(symbol) {
            if (!member(symbol.name, options.reserved)) {
                to_mangle.push(symbol);
            }
        }
    });

    AST_Toplevel.DEFMETHOD("find_unique_prefix", function(options) {
        var letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_";
        var cache = options.cache && options.cache.props;
        var prefixes = Object.create(null);
        options.reserved.forEach(add_prefix);
        this.globals.each(add_def);
        this.walk(new TreeWalker(function(node) {
            if (node instanceof AST_Scope) node.variables.each(add_def);
            if (node instanceof AST_SymbolCatch) add_def(node.definition());
        }));
        var prefix, i = 0;
        do {
            prefix = create_name(i++);
        } while (prefixes[prefix]);
        return prefix;

        function add_prefix(name) {
            if (/[0-9]$/.test(name)) {
                prefixes[name.replace(/[0-9]+$/, "")] = true;
            }
        }

        function add_def(def) {
            var name = def.name;
            if (def.global && cache && cache.has(name)) name = cache.get(name);
            else if (!def.unmangleable(options)) return;
            add_prefix(name);
        }

        function create_name(num) {
            var name = "";
            do {
                name += letters[num % letters.length];
                num = Math.floor(num / letters.length);
            } while (num);
            return name;
        }
    });

    AST_Toplevel.DEFMETHOD("expand_names", function(options) {
        options = this._default_mangler_options(options);
        var prefix = this.find_unique_prefix(options);
        this.globals.each(rename);
        this.walk(new TreeWalker(function(node) {
            if (node instanceof AST_Scope) node.variables.each(rename);
            if (node instanceof AST_SymbolCatch) rename(node.definition());
        }));

        function rename(def) {
            if (def.global || def.unmangleable(options)) return;
            if (member(def.name, options.reserved)) return;
            var d = def.redefined();
            def.name = d ? d.name : prefix + def.id;
            def.orig.forEach(function(sym) {
                sym.name = def.name;
            });
            def.references.forEach(function(sym) {
                sym.name = def.name;
            });
        }
    });

    AST_Node.DEFMETHOD("tail_node", return_this);
    AST_Sequence.DEFMETHOD("tail_node", function() {
        return this.expressions[this.expressions.length - 1];
    });

    AST_Toplevel.DEFMETHOD("compute_char_frequency", function(options){
        options = this._default_mangler_options(options);
        try {
            AST_Node.prototype.print = function(stream, force_parens) {
                this._print(stream, force_parens);
                if (this instanceof AST_Symbol && !this.unmangleable(options)) {
                    base54.consider(this.name, -1);
                } else if (options.properties) {
                    if (this instanceof AST_Dot) {
                        base54.consider(this.property, -1);
                    } else if (this instanceof AST_Sub) {
                        skip_string(this.property);
                    }
                }
            };
            base54.consider(this.print_to_string(), 1);
        } finally {
            AST_Node.prototype.print = AST_Node.prototype._print;
        }
        base54.sort();

        function skip_string(node) {
            if (node instanceof AST_String) {
                base54.consider(node.value, -1);
            } else if (node instanceof AST_Conditional) {
                skip_string(node.consequent);
                skip_string(node.alternative);
            } else if (node instanceof AST_Sequence) {
                skip_string(node.tail_node());
            }
        }
    });

    var base54 = (function() {
        var leading = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_".split("");
        var digits = "0123456789".split("");
        var chars, frequency;
        function reset() {
            frequency = Object.create(null);
            leading.forEach(function(ch) {
                frequency[ch] = 0;
            });
            digits.forEach(function(ch) {
                frequency[ch] = 0;
            });
        }
        base54.consider = function(str, delta) {
            for (var i = str.length; --i >= 0;) {
                frequency[str[i]] += delta;
            }
        };
        function compare(a, b) {
            return frequency[b] - frequency[a];
        }
        base54.sort = function() {
            chars = mergeSort(leading, compare).concat(mergeSort(digits, compare));
        };
        base54.reset = reset;
        reset();
        function base54(num) {
            var ret = "", base = 54;
            num++;
            do {
                num--;
                ret += chars[num % base];
                num = Math.floor(num / base);
                base = 64;
            } while (num > 0);
            return ret;
        };
        return base54;
    })();


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    var EXPECT_DIRECTIVE = /^$|[;{][\s\n]*$/;

    function is_some_comments(comment) {
        // multiline comment
        return comment.type == "comment2" && /@preserve|@license|@cc_on/i.test(comment.value);
    }

    function OutputStream(options) {

        var readonly = !options;
        options = defaults(options, {
            ascii_only       : false,
            beautify         : false,
            bracketize       : false,
            comments         : false,
            ie8              : false,
            indent_level     : 4,
            indent_start     : 0,
            inline_script    : true,
            keep_quoted_props: false,
            max_line_len     : false,
            preamble         : null,
            preserve_line    : false,
            quote_keys       : false,
            quote_style      : 0,
            semicolons       : true,
            shebang          : true,
            source_map       : null,
            webkit           : false,
            width            : 80,
            wrap_iife        : false,
        }, true);

        // Convert comment option to RegExp if neccessary and set up comments filter
        var comment_filter = return_false; // Default case, throw all comments away
        if (options.comments) {
            var comments = options.comments;
            if (typeof options.comments === "string" && /^\/.*\/[a-zA-Z]*$/.test(options.comments)) {
                var regex_pos = options.comments.lastIndexOf("/");
                comments = new RegExp(
                    options.comments.substr(1, regex_pos - 1),
                    options.comments.substr(regex_pos + 1)
                );
            }
            if (comments instanceof RegExp) {
                comment_filter = function(comment) {
                    return comment.type != "comment5" && comments.test(comment.value);
                };
            }
            else if (typeof comments === "function") {
                comment_filter = function(comment) {
                    return comment.type != "comment5" && comments(this, comment);
                };
            }
            else if (comments === "some") {
                comment_filter = is_some_comments;
            } else { // NOTE includes "all" option
                comment_filter = return_true;
            }
        }

        var indentation = 0;
        var current_col = 0;
        var current_line = 1;
        var current_pos = 0;
        var OUTPUT = "";

        var to_utf8 = options.ascii_only ? function(str, identifier) {
            return str.replace(/[\u0000-\u001f\u007f-\uffff]/g, function(ch) {
                var code = ch.charCodeAt(0).toString(16);
                if (code.length <= 2 && !identifier) {
                    while (code.length < 2) code = "0" + code;
                    return "\\x" + code;
                } else {
                    while (code.length < 4) code = "0" + code;
                    return "\\u" + code;
                }
            });
        } : function(str) {
            var s = "";
            for (var i = 0, len = str.length; i < len; i++) {
                if (is_surrogate_pair_head(str[i]) && !is_surrogate_pair_tail(str[i + 1])
                    || is_surrogate_pair_tail(str[i]) && !is_surrogate_pair_head(str[i - 1])) {
                    s += "\\u" + str.charCodeAt(i).toString(16);
                } else {
                    s += str[i];
                }
            }
            return s;
        };

        function make_string(str, quote) {
            var dq = 0, sq = 0;
            str = str.replace(/[\\\b\f\n\r\v\t\x22\x27\u2028\u2029\0\ufeff]/g,
                function(s, i){
                    switch (s) {
                        case '"': ++dq; return '"';
                        case "'": ++sq; return "'";
                        case "\\": return "\\\\";
                        case "\n": return "\\n";
                        case "\r": return "\\r";
                        case "\t": return "\\t";
                        case "\b": return "\\b";
                        case "\f": return "\\f";
                        case "\x0B": return options.ie8 ? "\\x0B" : "\\v";
                        case "\u2028": return "\\u2028";
                        case "\u2029": return "\\u2029";
                        case "\ufeff": return "\\ufeff";
                        case "\0":
                            return /[0-9]/.test(str.charAt(i+1)) ? "\\x00" : "\\0";
                    }
                    return s;
                });
            function quote_single() {
                return "'" + str.replace(/\x27/g, "\\'") + "'";
            }
            function quote_double() {
                return '"' + str.replace(/\x22/g, '\\"') + '"';
            }
            str = to_utf8(str);
            switch (options.quote_style) {
                case 1:
                    return quote_single();
                case 2:
                    return quote_double();
                case 3:
                    return quote == "'" ? quote_single() : quote_double();
                default:
                    return dq > sq ? quote_single() : quote_double();
            }
        };

        function encode_string(str, quote) {
            var ret = make_string(str, quote);
            if (options.inline_script) {
                ret = ret.replace(/<\x2fscript([>\/\t\n\f\r ])/gi, "<\\/script$1");
                ret = ret.replace(/\x3c!--/g, "\\x3c!--");
                ret = ret.replace(/--\x3e/g, "--\\x3e");
            }
            return ret;
        };

        function make_name(name) {
            name = name.toString();
            name = to_utf8(name, true);
            return name;
        };

        function make_indent(back) {
            return repeat_string(" ", options.indent_start + indentation - back * options.indent_level);
        };

        /* -----[ beautification/minification ]----- */

        var might_need_space = false;
        var might_need_semicolon = false;
        var might_add_newline = 0;
        var need_newline_indented = false;
        var need_space = false;
        var newline_insert = -1;
        var last = "";
        var mapping_token, mapping_name, mappings = options.source_map && [];

        var do_add_mapping = mappings ? function() {
            mappings.forEach(function(mapping) {
                try {
                    options.source_map.add(
                        mapping.token.file,
                        mapping.line, mapping.col,
                        mapping.token.line, mapping.token.col,
                        !mapping.name && mapping.token.type == "name" ? mapping.token.value : mapping.name
                    );
                } catch(ex) {
                    AST_Node.warn("Couldn't figure out mapping for {file}:{line},{col} → {cline},{ccol} [{name}]", {
                        file: mapping.token.file,
                        line: mapping.token.line,
                        col: mapping.token.col,
                        cline: mapping.line,
                        ccol: mapping.col,
                        name: mapping.name || ""
                    })
                }
            });
            mappings = [];
        } : noop;

        var ensure_line_len = options.max_line_len ? function() {
            if (current_col > options.max_line_len) {
                if (might_add_newline) {
                    var left = OUTPUT.slice(0, might_add_newline);
                    var right = OUTPUT.slice(might_add_newline);
                    if (mappings) {
                        var delta = right.length - current_col;
                        mappings.forEach(function(mapping) {
                            mapping.line++;
                            mapping.col += delta;
                        });
                    }
                    OUTPUT = left + "\n" + right;
                    current_line++;
                    current_pos++;
                    current_col = right.length;
                }
                if (current_col > options.max_line_len) {
                    AST_Node.warn("Output exceeds {max_line_len} characters", options);
                }
            }
            if (might_add_newline) {
                might_add_newline = 0;
                do_add_mapping();
            }
        } : noop;

        var requireSemicolonChars = makePredicate("( [ + * / - , .");

        function print(str) {
            str = String(str);
            var ch = str.charAt(0);
            if (need_newline_indented && ch) {
                need_newline_indented = false;
                if (ch != "\n") {
                    print("\n");
                    indent();
                }
            }
            if (need_space && ch) {
                need_space = false;
                if (!/[\s;})]/.test(ch)) {
                    space();
                }
            }
            newline_insert = -1;
            var prev = last.charAt(last.length - 1);
            if (might_need_semicolon) {
                might_need_semicolon = false;

                if (prev == ":" && ch == "}" || (!ch || ";}".indexOf(ch) < 0) && prev != ";") {
                    if (options.semicolons || requireSemicolonChars(ch)) {
                        OUTPUT += ";";
                        current_col++;
                        current_pos++;
                    } else {
                        ensure_line_len();
                        OUTPUT += "\n";
                        current_pos++;
                        current_line++;
                        current_col = 0;

                        if (/^\s+$/.test(str)) {
                            // reset the semicolon flag, since we didn't print one
                            // now and might still have to later
                            might_need_semicolon = true;
                        }
                    }

                    if (!options.beautify)
                        might_need_space = false;
                }
            }

            if (!options.beautify && options.preserve_line && stack[stack.length - 1]) {
                var target_line = stack[stack.length - 1].start.line;
                while (current_line < target_line) {
                    ensure_line_len();
                    OUTPUT += "\n";
                    current_pos++;
                    current_line++;
                    current_col = 0;
                    might_need_space = false;
                }
            }

            if (might_need_space) {
                if ((is_identifier_char(prev)
                    && (is_identifier_char(ch) || ch == "\\"))
                    || (ch == "/" && ch == prev)
                    || ((ch == "+" || ch == "-") && ch == last))
                {
                    OUTPUT += " ";
                    current_col++;
                    current_pos++;
                }
                might_need_space = false;
            }

            if (mapping_token) {
                mappings.push({
                    token: mapping_token,
                    name: mapping_name,
                    line: current_line,
                    col: current_col
                });
                mapping_token = false;
                if (!might_add_newline) do_add_mapping();
            }

            OUTPUT += str;
            current_pos += str.length;
            var a = str.split(/\r?\n/), n = a.length - 1;
            current_line += n;
            current_col += a[0].length;
            if (n > 0) {
                ensure_line_len();
                current_col = a[n].length;
            }
            last = str;
        };

        var space = options.beautify ? function() {
            print(" ");
        } : function() {
            might_need_space = true;
        };

        var indent = options.beautify ? function(half) {
            if (options.beautify) {
                print(make_indent(half ? 0.5 : 0));
            }
        } : noop;

        var with_indent = options.beautify ? function(col, cont) {
            if (col === true) col = next_indent();
            var save_indentation = indentation;
            indentation = col;
            var ret = cont();
            indentation = save_indentation;
            return ret;
        } : function(col, cont) { return cont() };

        var newline = options.beautify ? function() {
            if (newline_insert < 0) return print("\n");
            if (OUTPUT[newline_insert] != "\n") {
                OUTPUT = OUTPUT.slice(0, newline_insert) + "\n" + OUTPUT.slice(newline_insert);
                current_pos++;
                current_line++;
            }
            newline_insert++;
        } : options.max_line_len ? function() {
            ensure_line_len();
            might_add_newline = OUTPUT.length;
        } : noop;

        var semicolon = options.beautify ? function() {
            print(";");
        } : function() {
            might_need_semicolon = true;
        };

        function force_semicolon() {
            might_need_semicolon = false;
            print(";");
        };

        function next_indent() {
            return indentation + options.indent_level;
        };

        function with_block(cont) {
            var ret;
            print("{");
            newline();
            with_indent(next_indent(), function(){
                ret = cont();
            });
            indent();
            print("}");
            return ret;
        };

        function with_parens(cont) {
            print("(");
            //XXX: still nice to have that for argument lists
            //var ret = with_indent(current_col, cont);
            var ret = cont();
            print(")");
            return ret;
        };

        function with_square(cont) {
            print("[");
            //var ret = with_indent(current_col, cont);
            var ret = cont();
            print("]");
            return ret;
        };

        function comma() {
            print(",");
            space();
        };

        function colon() {
            print(":");
            space();
        };

        var add_mapping = mappings ? function(token, name) {
            mapping_token = token;
            mapping_name = name;
        } : noop;

        function get() {
            if (might_add_newline) {
                ensure_line_len();
            }
            return OUTPUT;
        };

        function prepend_comments(node) {
            var self = this;
            var start = node.start;
            if (!(start.comments_before && start.comments_before._dumped === self)) {
                var comments = start.comments_before;
                if (!comments) {
                    comments = start.comments_before = [];
                }
                comments._dumped = self;

                if (node instanceof AST_Exit && node.value) {
                    var tw = new TreeWalker(function(node) {
                        var parent = tw.parent();
                        if (parent instanceof AST_Exit
                            || parent instanceof AST_Binary && parent.left === node
                            || parent.TYPE == "Call" && parent.expression === node
                            || parent instanceof AST_Conditional && parent.condition === node
                            || parent instanceof AST_Dot && parent.expression === node
                            || parent instanceof AST_Sequence && parent.expressions[0] === node
                            || parent instanceof AST_Sub && parent.expression === node
                            || parent instanceof AST_UnaryPostfix) {
                            var text = node.start.comments_before;
                            if (text && text._dumped !== self) {
                                text._dumped = self;
                                comments = comments.concat(text);
                            }
                        } else {
                            return true;
                        }
                    });
                    tw.push(node);
                    node.value.walk(tw);
                }

                if (current_pos == 0) {
                    if (comments.length > 0 && options.shebang && comments[0].type == "comment5") {
                        print("#!" + comments.shift().value + "\n");
                        indent();
                    }
                    var preamble = options.preamble;
                    if (preamble) {
                        print(preamble.replace(/\r\n?|[\n\u2028\u2029]|\s*$/g, "\n"));
                    }
                }

                comments = comments.filter(comment_filter, node);
                if (comments.length == 0) return;
                var last_nlb = /(^|\n) *$/.test(OUTPUT);
                comments.forEach(function(c, i) {
                    if (!last_nlb) {
                        if (c.nlb) {
                            print("\n");
                            indent();
                            last_nlb = true;
                        } else if (i > 0) {
                            space();
                        }
                    }
                    if (/comment[134]/.test(c.type)) {
                        print("//" + c.value.replace(/[@#]__PURE__/g, ' ') + "\n");
                        indent();
                        last_nlb = true;
                    } else if (c.type == "comment2") {
                        print("/*" + c.value.replace(/[@#]__PURE__/g, ' ') + "*/");
                        last_nlb = false;
                    }
                });
                if (!last_nlb) {
                    if (start.nlb) {
                        print("\n");
                        indent();
                    } else {
                        space();
                    }
                }
            }
        }

        function append_comments(node, tail) {
            var self = this;
            var token = node.end;
            if (!token) return;
            var comments = token[tail ? "comments_before" : "comments_after"];
            if (comments && comments._dumped !== self) {
                comments._dumped = self;
                var insert = OUTPUT.length;
                comments.filter(comment_filter, node).forEach(function(c, i) {
                    need_space = false;
                    if (need_newline_indented) {
                        print("\n");
                        indent();
                        need_newline_indented = false;
                    } else if (c.nlb && (i > 0 || !/(^|\n) *$/.test(OUTPUT))) {
                        print("\n");
                        indent();
                    } else if (i > 0 || !tail) {
                        space();
                    }
                    if (/comment[134]/.test(c.type)) {
                        print("//" + c.value.replace(/[@#]__PURE__/g, ' '));
                        need_newline_indented = true;
                    } else if (c.type == "comment2") {
                        print("/*" + c.value.replace(/[@#]__PURE__/g, ' ') + "*/");
                        need_space = true;
                    }
                });
                if (OUTPUT.length > insert) newline_insert = insert;
            }
        }

        var stack = [];
        return {
            get             : get,
            toString        : get,
            indent          : indent,
            indentation     : function() { return indentation },
            current_width   : function() { return current_col - indentation },
            should_break    : function() { return options.width && this.current_width() >= options.width },
            newline         : newline,
            print           : print,
            space           : space,
            comma           : comma,
            colon           : colon,
            last            : function() { return last },
            semicolon       : semicolon,
            force_semicolon : force_semicolon,
            to_utf8         : to_utf8,
            print_name      : function(name) { print(make_name(name)) },
            print_string    : function(str, quote, escape_directive) {
                var encoded = encode_string(str, quote);
                if (escape_directive === true && encoded.indexOf("\\") === -1) {
                    // Insert semicolons to break directive prologue
                    if (!EXPECT_DIRECTIVE.test(OUTPUT)) {
                        force_semicolon();
                    }
                    force_semicolon();
                }
                print(encoded);
            },
            encode_string   : encode_string,
            next_indent     : next_indent,
            with_indent     : with_indent,
            with_block      : with_block,
            with_parens     : with_parens,
            with_square     : with_square,
            add_mapping     : add_mapping,
            option          : function(opt) { return options[opt] },
            prepend_comments: readonly ? noop : prepend_comments,
            append_comments : readonly ? noop : append_comments,
            line            : function() { return current_line },
            col             : function() { return current_col },
            pos             : function() { return current_pos },
            push_node       : function(node) { stack.push(node) },
            pop_node        : function() { return stack.pop() },
            parent          : function(n) {
                return stack[stack.length - 2 - (n || 0)];
            }
        };

    };

    /* -----[ code generators ]----- */

    (function(){

        /* -----[ utils ]----- */

        function DEFPRINT(nodetype, generator) {
            nodetype.DEFMETHOD("_codegen", generator);
        };

        var in_directive = false;
        var active_scope = null;
        var use_asm = null;

        AST_Node.DEFMETHOD("print", function(stream, force_parens){
            var self = this, generator = self._codegen;
            if (self instanceof AST_Scope) {
                active_scope = self;
            }
            else if (!use_asm && self instanceof AST_Directive && self.value == "use asm") {
                use_asm = active_scope;
            }
            function doit() {
                stream.prepend_comments(self);
                self.add_source_map(stream);
                generator(self, stream);
                stream.append_comments(self);
            }
            stream.push_node(self);
            if (force_parens || self.needs_parens(stream)) {
                stream.with_parens(doit);
            } else {
                doit();
            }
            stream.pop_node();
            if (self === use_asm) {
                use_asm = null;
            }
        });
        AST_Node.DEFMETHOD("_print", AST_Node.prototype.print);

        AST_Node.DEFMETHOD("print_to_string", function(options){
            var s = OutputStream(options);
            this.print(s);
            return s.get();
        });

        /* -----[ PARENTHESES ]----- */

        function PARENS(nodetype, func) {
            if (Array.isArray(nodetype)) {
                nodetype.forEach(function(nodetype){
                    PARENS(nodetype, func);
                });
            } else {
                nodetype.DEFMETHOD("needs_parens", func);
            }
        };

        PARENS(AST_Node, return_false);

        // a function expression needs parens around it when it's provably
        // the first token to appear in a statement.
        PARENS(AST_Function, function(output){
            if (first_in_statement(output)) {
                return true;
            }

            if (output.option('webkit')) {
                var p = output.parent();
                if (p instanceof AST_PropAccess && p.expression === this) {
                    return true;
                }
            }

            if (output.option('wrap_iife')) {
                var p = output.parent();
                return p instanceof AST_Call && p.expression === this;
            }

            return false;
        });

        // same goes for an object literal, because otherwise it would be
        // interpreted as a block of code.
        PARENS(AST_Object, first_in_statement);

        PARENS(AST_Unary, function(output){
            var p = output.parent();
            return p instanceof AST_PropAccess && p.expression === this
                || p instanceof AST_Call && p.expression === this;
        });

        PARENS(AST_Sequence, function(output){
            var p = output.parent();
            return p instanceof AST_Call             // (foo, bar)() or foo(1, (2, 3), 4)
                || p instanceof AST_Unary            // !(foo, bar, baz)
                || p instanceof AST_Binary           // 1 + (2, 3) + 4 ==> 8
                || p instanceof AST_VarDef           // var a = (1, 2), b = a + a; ==> b == 4
                || p instanceof AST_PropAccess       // (1, {foo:2}).foo or (1, {foo:2})["foo"] ==> 2
                || p instanceof AST_Array            // [ 1, (2, 3), 4 ] ==> [ 1, 3, 4 ]
                || p instanceof AST_ObjectProperty   // { foo: (1, 2) }.foo ==> 2
                || p instanceof AST_Conditional      /* (false, true) ? (a = 10, b = 20) : (c = 30)
                                                  * ==> 20 (side effect, set a := 10 and b := 20) */
                ;
        });

        PARENS(AST_Binary, function(output){
            var p = output.parent();
            // (foo && bar)()
            if (p instanceof AST_Call && p.expression === this)
                return true;
            // typeof (foo && bar)
            if (p instanceof AST_Unary)
                return true;
            // (foo && bar)["prop"], (foo && bar).prop
            if (p instanceof AST_PropAccess && p.expression === this)
                return true;
            // this deals with precedence: 3 * (2 + 1)
            if (p instanceof AST_Binary) {
                var po = p.operator, pp = PRECEDENCE[po];
                var so = this.operator, sp = PRECEDENCE[so];
                if (pp > sp
                    || (pp == sp
                        && this === p.right)) {
                    return true;
                }
            }
        });

        PARENS(AST_PropAccess, function(output){
            var p = output.parent();
            if (p instanceof AST_New && p.expression === this) {
                // i.e. new (foo.bar().baz)
                //
                // if there's one call into this subtree, then we need
                // parens around it too, otherwise the call will be
                // interpreted as passing the arguments to the upper New
                // expression.
                var parens = false;
                this.walk(new TreeWalker(function(node) {
                    if (parens || node instanceof AST_Scope) return true;
                    if (node instanceof AST_Call) {
                        parens = true;
                        return true;
                    }
                }));
                return parens;
            }
        });

        PARENS(AST_Call, function(output){
            var p = output.parent(), p1;
            if (p instanceof AST_New && p.expression === this)
                return true;

            // workaround for Safari bug.
            // https://bugs.webkit.org/show_bug.cgi?id=123506
            return this.expression instanceof AST_Function
                && p instanceof AST_PropAccess
                && p.expression === this
                && (p1 = output.parent(1)) instanceof AST_Assign
                && p1.left === p;
        });

        PARENS(AST_New, function(output){
            var p = output.parent();
            if (!need_constructor_parens(this, output)
                && (p instanceof AST_PropAccess // (new Date).getTime(), (new Date)["getTime"]()
                    || p instanceof AST_Call && p.expression === this)) // (new foo)(bar)
                return true;
        });

        PARENS(AST_Number, function(output){
            var p = output.parent();
            if (p instanceof AST_PropAccess && p.expression === this) {
                var value = this.getValue();
                if (value < 0 || /^0/.test(make_num(value))) {
                    return true;
                }
            }
        });

        PARENS([ AST_Assign, AST_Conditional ], function(output){
            var p = output.parent();
            // !(a = false) → true
            if (p instanceof AST_Unary)
                return true;
            // 1 + (a = 2) + 3 → 6, side effect setting a = 2
            if (p instanceof AST_Binary && !(p instanceof AST_Assign))
                return true;
            // (a = func)() —or— new (a = Object)()
            if (p instanceof AST_Call && p.expression === this)
                return true;
            // (a = foo) ? bar : baz
            if (p instanceof AST_Conditional && p.condition === this)
                return true;
            // (a = foo)["prop"] —or— (a = foo).prop
            if (p instanceof AST_PropAccess && p.expression === this)
                return true;
        });

        /* -----[ PRINTERS ]----- */

        DEFPRINT(AST_Directive, function(self, output){
            output.print_string(self.value, self.quote);
            output.semicolon();
        });
        DEFPRINT(AST_Debugger, function(self, output){
            output.print("debugger");
            output.semicolon();
        });

        /* -----[ statements ]----- */

        function display_body(body, is_toplevel, output, allow_directives) {
            var last = body.length - 1;
            in_directive = allow_directives;
            body.forEach(function(stmt, i){
                if (in_directive === true && !(stmt instanceof AST_Directive ||
                    stmt instanceof AST_EmptyStatement ||
                    (stmt instanceof AST_SimpleStatement && stmt.body instanceof AST_String)
                )) {
                    in_directive = false;
                }
                if (!(stmt instanceof AST_EmptyStatement)) {
                    output.indent();
                    stmt.print(output);
                    if (!(i == last && is_toplevel)) {
                        output.newline();
                        if (is_toplevel) output.newline();
                    }
                }
                if (in_directive === true &&
                    stmt instanceof AST_SimpleStatement &&
                    stmt.body instanceof AST_String
                ) {
                    in_directive = false;
                }
            });
            in_directive = false;
        };

        AST_StatementWithBody.DEFMETHOD("_do_print_body", function(output){
            force_statement(this.body, output);
        });

        DEFPRINT(AST_Statement, function(self, output){
            self.body.print(output);
            output.semicolon();
        });
        DEFPRINT(AST_Toplevel, function(self, output){
            display_body(self.body, true, output, true);
            output.print("");
        });
        DEFPRINT(AST_LabeledStatement, function(self, output){
            self.label.print(output);
            output.colon();
            self.body.print(output);
        });
        DEFPRINT(AST_SimpleStatement, function(self, output){
            self.body.print(output);
            output.semicolon();
        });
        function print_bracketed(self, output, allow_directives) {
            if (self.body.length > 0) {
                output.with_block(function() {
                    display_body(self.body, false, output, allow_directives);
                });
            } else {
                output.print("{");
                output.with_indent(output.next_indent(), function() {
                    output.append_comments(self, true);
                });
                output.print("}");
            }
        };
        DEFPRINT(AST_BlockStatement, function(self, output){
            print_bracketed(self, output);
        });
        DEFPRINT(AST_EmptyStatement, function(self, output){
            output.semicolon();
        });
        DEFPRINT(AST_Do, function(self, output){
            output.print("do");
            output.space();
            make_block(self.body, output);
            output.space();
            output.print("while");
            output.space();
            output.with_parens(function(){
                self.condition.print(output);
            });
            output.semicolon();
        });
        DEFPRINT(AST_While, function(self, output){
            output.print("while");
            output.space();
            output.with_parens(function(){
                self.condition.print(output);
            });
            output.space();
            self._do_print_body(output);
        });
        DEFPRINT(AST_For, function(self, output){
            output.print("for");
            output.space();
            output.with_parens(function(){
                if (self.init) {
                    if (self.init instanceof AST_Definitions) {
                        self.init.print(output);
                    } else {
                        parenthesize_for_noin(self.init, output, true);
                    }
                    output.print(";");
                    output.space();
                } else {
                    output.print(";");
                }
                if (self.condition) {
                    self.condition.print(output);
                    output.print(";");
                    output.space();
                } else {
                    output.print(";");
                }
                if (self.step) {
                    self.step.print(output);
                }
            });
            output.space();
            self._do_print_body(output);
        });
        DEFPRINT(AST_ForIn, function(self, output){
            output.print("for");
            output.space();
            output.with_parens(function(){
                self.init.print(output);
                output.space();
                output.print("in");
                output.space();
                self.object.print(output);
            });
            output.space();
            self._do_print_body(output);
        });
        DEFPRINT(AST_With, function(self, output){
            output.print("with");
            output.space();
            output.with_parens(function(){
                self.expression.print(output);
            });
            output.space();
            self._do_print_body(output);
        });

        /* -----[ functions ]----- */
        AST_Lambda.DEFMETHOD("_do_print", function(output, nokeyword){
            var self = this;
            if (!nokeyword) {
                output.print("function");
            }
            if (self.name) {
                output.space();
                self.name.print(output);
            }
            output.with_parens(function(){
                self.argnames.forEach(function(arg, i){
                    if (i) output.comma();
                    arg.print(output);
                });
            });
            output.space();
            print_bracketed(self, output, true);
        });
        DEFPRINT(AST_Lambda, function(self, output){
            self._do_print(output);
        });

        /* -----[ exits ]----- */
        AST_Exit.DEFMETHOD("_do_print", function(output, kind){
            output.print(kind);
            if (this.value) {
                output.space();
                this.value.print(output);
            }
            output.semicolon();
        });
        DEFPRINT(AST_Return, function(self, output){
            self._do_print(output, "return");
        });
        DEFPRINT(AST_Throw, function(self, output){
            self._do_print(output, "throw");
        });

        /* -----[ loop control ]----- */
        AST_LoopControl.DEFMETHOD("_do_print", function(output, kind){
            output.print(kind);
            if (this.label) {
                output.space();
                this.label.print(output);
            }
            output.semicolon();
        });
        DEFPRINT(AST_Break, function(self, output){
            self._do_print(output, "break");
        });
        DEFPRINT(AST_Continue, function(self, output){
            self._do_print(output, "continue");
        });

        /* -----[ if ]----- */
        function make_then(self, output) {
            var b = self.body;
            if (output.option("bracketize")
                || output.option("ie8") && b instanceof AST_Do)
                return make_block(b, output);
            // The squeezer replaces "block"-s that contain only a single
            // statement with the statement itself; technically, the AST
            // is correct, but this can create problems when we output an
            // IF having an ELSE clause where the THEN clause ends in an
            // IF *without* an ELSE block (then the outer ELSE would refer
            // to the inner IF).  This function checks for this case and
            // adds the block brackets if needed.
            if (!b) return output.force_semicolon();
            while (true) {
                if (b instanceof AST_If) {
                    if (!b.alternative) {
                        make_block(self.body, output);
                        return;
                    }
                    b = b.alternative;
                }
                else if (b instanceof AST_StatementWithBody) {
                    b = b.body;
                }
                else break;
            }
            force_statement(self.body, output);
        };
        DEFPRINT(AST_If, function(self, output){
            output.print("if");
            output.space();
            output.with_parens(function(){
                self.condition.print(output);
            });
            output.space();
            if (self.alternative) {
                make_then(self, output);
                output.space();
                output.print("else");
                output.space();
                if (self.alternative instanceof AST_If)
                    self.alternative.print(output);
                else
                    force_statement(self.alternative, output);
            } else {
                self._do_print_body(output);
            }
        });

        /* -----[ switch ]----- */
        DEFPRINT(AST_Switch, function(self, output){
            output.print("switch");
            output.space();
            output.with_parens(function(){
                self.expression.print(output);
            });
            output.space();
            var last = self.body.length - 1;
            if (last < 0) output.print("{}");
            else output.with_block(function(){
                self.body.forEach(function(branch, i){
                    output.indent(true);
                    branch.print(output);
                    if (i < last && branch.body.length > 0)
                        output.newline();
                });
            });
        });
        AST_SwitchBranch.DEFMETHOD("_do_print_body", function(output){
            output.newline();
            this.body.forEach(function(stmt){
                output.indent();
                stmt.print(output);
                output.newline();
            });
        });
        DEFPRINT(AST_Default, function(self, output){
            output.print("default:");
            self._do_print_body(output);
        });
        DEFPRINT(AST_Case, function(self, output){
            output.print("case");
            output.space();
            self.expression.print(output);
            output.print(":");
            self._do_print_body(output);
        });

        /* -----[ exceptions ]----- */
        DEFPRINT(AST_Try, function(self, output){
            output.print("try");
            output.space();
            print_bracketed(self, output);
            if (self.bcatch) {
                output.space();
                self.bcatch.print(output);
            }
            if (self.bfinally) {
                output.space();
                self.bfinally.print(output);
            }
        });
        DEFPRINT(AST_Catch, function(self, output){
            output.print("catch");
            output.space();
            output.with_parens(function(){
                self.argname.print(output);
            });
            output.space();
            print_bracketed(self, output);
        });
        DEFPRINT(AST_Finally, function(self, output){
            output.print("finally");
            output.space();
            print_bracketed(self, output);
        });

        /* -----[ var/const ]----- */
        AST_Definitions.DEFMETHOD("_do_print", function(output, kind){
            output.print(kind);
            output.space();
            this.definitions.forEach(function(def, i){
                if (i) output.comma();
                def.print(output);
            });
            var p = output.parent();
            var in_for = p instanceof AST_For || p instanceof AST_ForIn;
            var avoid_semicolon = in_for && p.init === this;
            if (!avoid_semicolon)
                output.semicolon();
        });
        DEFPRINT(AST_Var, function(self, output){
            self._do_print(output, "var");
        });

        function parenthesize_for_noin(node, output, noin) {
            var parens = false;
            // need to take some precautions here:
            //    https://github.com/mishoo/UglifyJS2/issues/60
            if (noin) node.walk(new TreeWalker(function(node) {
                if (parens || node instanceof AST_Scope) return true;
                if (node instanceof AST_Binary && node.operator == "in") {
                    parens = true;
                    return true;
                }
            }));
            node.print(output, parens);
        };

        DEFPRINT(AST_VarDef, function(self, output){
            self.name.print(output);
            if (self.value) {
                output.space();
                output.print("=");
                output.space();
                var p = output.parent(1);
                var noin = p instanceof AST_For || p instanceof AST_ForIn;
                parenthesize_for_noin(self.value, output, noin);
            }
        });

        /* -----[ other expressions ]----- */
        DEFPRINT(AST_Call, function(self, output){
            self.expression.print(output);
            if (self instanceof AST_New && !need_constructor_parens(self, output))
                return;
            if (self.expression instanceof AST_Call || self.expression instanceof AST_Lambda) {
                output.add_mapping(self.start);
            }
            output.with_parens(function(){
                self.args.forEach(function(expr, i){
                    if (i) output.comma();
                    expr.print(output);
                });
            });
        });
        DEFPRINT(AST_New, function(self, output){
            output.print("new");
            output.space();
            AST_Call.prototype._codegen(self, output);
        });

        AST_Sequence.DEFMETHOD("_do_print", function(output){
            this.expressions.forEach(function(node, index) {
                if (index > 0) {
                    output.comma();
                    if (output.should_break()) {
                        output.newline();
                        output.indent();
                    }
                }
                node.print(output);
            });
        });
        DEFPRINT(AST_Sequence, function(self, output){
            self._do_print(output);
            // var p = output.parent();
            // if (p instanceof AST_Statement) {
            //     output.with_indent(output.next_indent(), function(){
            //         self._do_print(output);
            //     });
            // } else {
            //     self._do_print(output);
            // }
        });
        DEFPRINT(AST_Dot, function(self, output){
            var expr = self.expression;
            expr.print(output);
            var prop = self.property;
            if (output.option("ie8") && RESERVED_WORDS(prop)) {
                output.print("[");
                output.add_mapping(self.end);
                output.print_string(prop);
                output.print("]");
            } else {
                if (expr instanceof AST_Number && expr.getValue() >= 0) {
                    if (!/[xa-f.)]/i.test(output.last())) {
                        output.print(".");
                    }
                }
                output.print(".");
                // the name after dot would be mapped about here.
                output.add_mapping(self.end);
                output.print_name(prop);
            }
        });
        DEFPRINT(AST_Sub, function(self, output){
            self.expression.print(output);
            output.print("[");
            self.property.print(output);
            output.print("]");
        });
        DEFPRINT(AST_UnaryPrefix, function(self, output){
            var op = self.operator;
            output.print(op);
            if (/^[a-z]/i.test(op)
                || (/[+-]$/.test(op)
                    && self.expression instanceof AST_UnaryPrefix
                    && /^[+-]/.test(self.expression.operator))) {
                output.space();
            }
            self.expression.print(output);
        });
        DEFPRINT(AST_UnaryPostfix, function(self, output){
            self.expression.print(output);
            output.print(self.operator);
        });
        DEFPRINT(AST_Binary, function(self, output){
            var op = self.operator;
            self.left.print(output);
            if (op[0] == ">" /* ">>" ">>>" ">" ">=" */
                && self.left instanceof AST_UnaryPostfix
                && self.left.operator == "--") {
                // space is mandatory to avoid outputting -->
                output.print(" ");
            } else {
                // the space is optional depending on "beautify"
                output.space();
            }
            output.print(op);
            if ((op == "<" || op == "<<")
                && self.right instanceof AST_UnaryPrefix
                && self.right.operator == "!"
                && self.right.expression instanceof AST_UnaryPrefix
                && self.right.expression.operator == "--") {
                // space is mandatory to avoid outputting <!--
                output.print(" ");
            } else {
                // the space is optional depending on "beautify"
                output.space();
            }
            self.right.print(output);
        });
        DEFPRINT(AST_Conditional, function(self, output){
            self.condition.print(output);
            output.space();
            output.print("?");
            output.space();
            self.consequent.print(output);
            output.space();
            output.colon();
            self.alternative.print(output);
        });

        /* -----[ literals ]----- */
        DEFPRINT(AST_Array, function(self, output){
            output.with_square(function(){
                var a = self.elements, len = a.length;
                if (len > 0) output.space();
                a.forEach(function(exp, i){
                    if (i) output.comma();
                    exp.print(output);
                    // If the final element is a hole, we need to make sure it
                    // doesn't look like a trailing comma, by inserting an actual
                    // trailing comma.
                    if (i === len - 1 && exp instanceof AST_Hole)
                        output.comma();
                });
                if (len > 0) output.space();
            });
        });
        DEFPRINT(AST_Object, function(self, output){
            if (self.properties.length > 0) output.with_block(function(){
                self.properties.forEach(function(prop, i){
                    if (i) {
                        output.print(",");
                        output.newline();
                    }
                    output.indent();
                    prop.print(output);
                });
                output.newline();
            });
            else output.print("{}");
        });

        function print_property_name(key, quote, output) {
            if (output.option("quote_keys")) {
                output.print_string(key + "");
            } else if ((typeof key == "number"
                || !output.option("beautify")
                && +key + "" == key)
                && parseFloat(key) >= 0) {
                output.print(make_num(key));
            } else if (RESERVED_WORDS(key) ? !output.option("ie8") : is_identifier_string(key)) {
                if (quote && output.option("keep_quoted_props")) {
                    output.print_string(key, quote);
                } else {
                    output.print_name(key);
                }
            } else {
                output.print_string(key, quote);
            }
        }

        DEFPRINT(AST_ObjectKeyVal, function(self, output){
            print_property_name(self.key, self.quote, output);
            output.colon();
            self.value.print(output);
        });
        AST_ObjectProperty.DEFMETHOD("_print_getter_setter", function(type, output) {
            output.print(type);
            output.space();
            print_property_name(this.key.name, this.quote, output);
            this.value._do_print(output, true);
        });
        DEFPRINT(AST_ObjectSetter, function(self, output){
            self._print_getter_setter("set", output);
        });
        DEFPRINT(AST_ObjectGetter, function(self, output){
            self._print_getter_setter("get", output);
        });
        DEFPRINT(AST_Symbol, function(self, output){
            var def = self.definition();
            output.print_name(def ? def.mangled_name || def.name : self.name);
        });
        DEFPRINT(AST_Hole, noop);
        DEFPRINT(AST_This, function(self, output){
            output.print("this");
        });
        DEFPRINT(AST_Constant, function(self, output){
            output.print(self.getValue());
        });
        DEFPRINT(AST_String, function(self, output){
            output.print_string(self.getValue(), self.quote, in_directive);
        });
        DEFPRINT(AST_Number, function(self, output){
            if (use_asm && self.start && self.start.raw != null) {
                output.print(self.start.raw);
            } else {
                output.print(make_num(self.getValue()));
            }
        });

        DEFPRINT(AST_RegExp, function(self, output){
            var regexp = self.getValue();
            var str = regexp.toString();
            if (regexp.raw_source) {
                str = "/" + regexp.raw_source + str.slice(str.lastIndexOf("/"));
            }
            str = output.to_utf8(str);
            output.print(str);
            var p = output.parent();
            if (p instanceof AST_Binary && /^in/.test(p.operator) && p.left === self)
                output.print(" ");
        });

        function force_statement(stat, output) {
            if (output.option("bracketize")) {
                make_block(stat, output);
            } else {
                if (!stat || stat instanceof AST_EmptyStatement)
                    output.force_semicolon();
                else
                    stat.print(output);
            }
        };

        // self should be AST_New.  decide if we want to show parens or not.
        function need_constructor_parens(self, output) {
            // Always print parentheses with arguments
            if (self.args.length > 0) return true;

            return output.option("beautify");
        };

        function best_of(a) {
            var best = a[0], len = best.length;
            for (var i = 1; i < a.length; ++i) {
                if (a[i].length < len) {
                    best = a[i];
                    len = best.length;
                }
            }
            return best;
        };

        function make_num(num) {
            var str = num.toString(10), a = [ str.replace(/^0\./, ".").replace('e+', 'e') ], m;
            if (Math.floor(num) === num) {
                if (num >= 0) {
                    a.push("0x" + num.toString(16).toLowerCase(), // probably pointless
                        "0" + num.toString(8)); // same.
                } else {
                    a.push("-0x" + (-num).toString(16).toLowerCase(), // probably pointless
                        "-0" + (-num).toString(8)); // same.
                }
                if ((m = /^(.*?)(0+)$/.exec(num))) {
                    a.push(m[1] + "e" + m[2].length);
                }
            } else if ((m = /^0?\.(0+)(.*)$/.exec(num))) {
                a.push(m[2] + "e-" + (m[1].length + m[2].length),
                    str.substr(str.indexOf(".")));
            }
            return best_of(a);
        };

        function make_block(stmt, output) {
            if (!stmt || stmt instanceof AST_EmptyStatement)
                output.print("{}");
            else if (stmt instanceof AST_BlockStatement)
                stmt.print(output);
            else output.with_block(function(){
                    output.indent();
                    stmt.print(output);
                    output.newline();
                });
        };

        /* -----[ source map generators ]----- */

        function DEFMAP(nodetype, generator) {
            nodetype.DEFMETHOD("add_source_map", function(stream){
                generator(this, stream);
            });
        };

        // We could easily add info for ALL nodes, but it seems to me that
        // would be quite wasteful, hence this noop in the base class.
        DEFMAP(AST_Node, noop);

        function basic_sourcemap_gen(self, output) {
            output.add_mapping(self.start);
        };

        // XXX: I'm not exactly sure if we need it for all of these nodes,
        // or if we should add even more.

        DEFMAP(AST_Directive, basic_sourcemap_gen);
        DEFMAP(AST_Debugger, basic_sourcemap_gen);
        DEFMAP(AST_Symbol, basic_sourcemap_gen);
        DEFMAP(AST_Jump, basic_sourcemap_gen);
        DEFMAP(AST_StatementWithBody, basic_sourcemap_gen);
        DEFMAP(AST_LabeledStatement, noop); // since the label symbol will mark it
        DEFMAP(AST_Lambda, basic_sourcemap_gen);
        DEFMAP(AST_Switch, basic_sourcemap_gen);
        DEFMAP(AST_SwitchBranch, basic_sourcemap_gen);
        DEFMAP(AST_BlockStatement, basic_sourcemap_gen);
        DEFMAP(AST_Toplevel, noop);
        DEFMAP(AST_New, basic_sourcemap_gen);
        DEFMAP(AST_Try, basic_sourcemap_gen);
        DEFMAP(AST_Catch, basic_sourcemap_gen);
        DEFMAP(AST_Finally, basic_sourcemap_gen);
        DEFMAP(AST_Definitions, basic_sourcemap_gen);
        DEFMAP(AST_Constant, basic_sourcemap_gen);
        DEFMAP(AST_ObjectSetter, function(self, output){
            output.add_mapping(self.start, self.key.name);
        });
        DEFMAP(AST_ObjectGetter, function(self, output){
            output.add_mapping(self.start, self.key.name);
        });
        DEFMAP(AST_ObjectProperty, function(self, output){
            output.add_mapping(self.start, self.key);
        });

    })();


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    function Compressor(options, false_by_default) {
        if (!(this instanceof Compressor))
            return new Compressor(options, false_by_default);
        TreeTransformer.call(this, this.before, this.after);
        this.options = defaults(options, {
            booleans      : !false_by_default,
            collapse_vars : !false_by_default,
            comparisons   : !false_by_default,
            conditionals  : !false_by_default,
            dead_code     : !false_by_default,
            drop_console  : false,
            drop_debugger : !false_by_default,
            evaluate      : !false_by_default,
            expression    : false,
            global_defs   : {},
            hoist_funs    : false,
            hoist_props   : !false_by_default,
            hoist_vars    : false,
            ie8           : false,
            if_return     : !false_by_default,
            inline        : !false_by_default,
            join_vars     : !false_by_default,
            keep_fargs    : true,
            keep_fnames   : false,
            keep_infinity : false,
            loops         : !false_by_default,
            negate_iife   : !false_by_default,
            passes        : 1,
            properties    : !false_by_default,
            pure_getters  : !false_by_default && "strict",
            pure_funcs    : null,
            reduce_funcs  : !false_by_default,
            reduce_vars   : !false_by_default,
            sequences     : !false_by_default,
            side_effects  : !false_by_default,
            switches      : !false_by_default,
            top_retain    : null,
            toplevel      : !!(options && options["top_retain"]),
            typeofs       : !false_by_default,
            unsafe        : false,
            unsafe_comps  : false,
            unsafe_Func   : false,
            unsafe_math   : false,
            unsafe_proto  : false,
            unsafe_regexp : false,
            unused        : !false_by_default,
            warnings      : false,
        }, true);
        var global_defs = this.options["global_defs"];
        if (typeof global_defs == "object") for (var key in global_defs) {
            if (/^@/.test(key) && HOP(global_defs, key)) {
                global_defs[key.slice(1)] = parse(global_defs[key], {
                    expression: true
                });
            }
        }
        var pure_funcs = this.options["pure_funcs"];
        if (typeof pure_funcs == "function") {
            this.pure_funcs = pure_funcs;
        } else {
            this.pure_funcs = pure_funcs ? function(node) {
                return pure_funcs.indexOf(node.expression.print_to_string()) < 0;
            } : return_true;
        }
        var top_retain = this.options["top_retain"];
        if (top_retain instanceof RegExp) {
            this.top_retain = function(def) {
                return top_retain.test(def.name);
            };
        } else if (typeof top_retain == "function") {
            this.top_retain = top_retain;
        } else if (top_retain) {
            if (typeof top_retain == "string") {
                top_retain = top_retain.split(/,/);
            }
            this.top_retain = function(def) {
                return top_retain.indexOf(def.name) >= 0;
            };
        }
        var toplevel = this.options["toplevel"];
        this.toplevel = typeof toplevel == "string" ? {
            funcs: /funcs/.test(toplevel),
            vars: /vars/.test(toplevel)
        } : {
            funcs: toplevel,
            vars: toplevel
        };
        var sequences = this.options["sequences"];
        this.sequences_limit = sequences == 1 ? 800 : sequences | 0;
        this.warnings_produced = {};
    };

    Compressor.prototype = new TreeTransformer;
    merge(Compressor.prototype, {
        option: function(key) { return this.options[key] },
        exposed: function(def) {
            if (def.global) for (var i = 0, len = def.orig.length; i < len; i++)
                if (!this.toplevel[def.orig[i] instanceof AST_SymbolDefun ? "funcs" : "vars"])
                    return true;
            return false;
        },
        in_boolean_context: function() {
            if (!this.option("booleans")) return false;
            var self = this.self();
            for (var i = 0, p; p = this.parent(i); i++) {
                if (p instanceof AST_SimpleStatement
                    || p instanceof AST_Conditional && p.condition === self
                    || p instanceof AST_DWLoop && p.condition === self
                    || p instanceof AST_For && p.condition === self
                    || p instanceof AST_If && p.condition === self
                    || p instanceof AST_UnaryPrefix && p.operator == "!" && p.expression === self) {
                    return true;
                }
                if (p instanceof AST_Binary && (p.operator == "&&" || p.operator == "||")
                    || p instanceof AST_Conditional
                    || p.tail_node() === self) {
                    self = p;
                } else {
                    return false;
                }
            }
        },
        compress: function(node) {
            if (this.option("expression")) {
                node.process_expression(true);
            }
            var passes = +this.options.passes || 1;
            var last_count = 1 / 0;
            var mangle = { ie8: this.option("ie8") };
            for (var pass = 0; pass < passes; pass++) {
                node.figure_out_scope(mangle);
                if (pass > 0 || this.option("reduce_vars"))
                    node.reset_opt_flags(this);
                node = node.transform(this);
                if (passes > 1) {
                    var count = 0;
                    node.walk(new TreeWalker(function() {
                        count++;
                    }));
                    this.info("pass " + pass + ": last_count: " + last_count + ", count: " + count);
                    if (count >= last_count) break;
                    last_count = count;
                }
            }
            if (this.option("expression")) {
                node.process_expression(false);
            }
            return node;
        },
        info: function() {
            if (this.options.warnings == "verbose") {
                AST_Node.warn.apply(AST_Node, arguments);
            }
        },
        warn: function(text, props) {
            if (this.options.warnings) {
                // only emit unique warnings
                var message = string_template(text, props);
                if (!(message in this.warnings_produced)) {
                    this.warnings_produced[message] = true;
                    AST_Node.warn.apply(AST_Node, arguments);
                }
            }
        },
        clear_warnings: function() {
            this.warnings_produced = {};
        },
        before: function(node, descend, in_list) {
            if (node._squeezed) return node;
            var was_scope = false;
            if (node instanceof AST_Scope) {
                node = node.hoist_properties(this);
                node = node.hoist_declarations(this);
                was_scope = true;
            }
            // Before https://github.com/mishoo/UglifyJS2/pull/1602 AST_Node.optimize()
            // would call AST_Node.transform() if a different instance of AST_Node is
            // produced after OPT().
            // This corrupts TreeWalker.stack, which cause AST look-ups to malfunction.
            // Migrate and defer all children's AST_Node.transform() to below, which
            // will now happen after this parent AST_Node has been properly substituted
            // thus gives a consistent AST snapshot.
            descend(node, this);
            // Existing code relies on how AST_Node.optimize() worked, and omitting the
            // following replacement call would result in degraded efficiency of both
            // output and performance.
            descend(node, this);
            var opt = node.optimize(this);
            if (was_scope && opt instanceof AST_Scope) {
                opt.drop_unused(this);
                descend(opt, this);
            }
            if (opt === node) opt._squeezed = true;
            return opt;
        }
    });

    (function(){

        function OPT(node, optimizer) {
            node.DEFMETHOD("optimize", function(compressor){
                var self = this;
                if (self._optimized) return self;
                if (compressor.has_directive("use asm")) return self;
                var opt = optimizer(self, compressor);
                opt._optimized = true;
                return opt;
            });
        };

        OPT(AST_Node, function(self, compressor){
            return self;
        });

        AST_Node.DEFMETHOD("equivalent_to", function(node){
            return this.TYPE == node.TYPE && this.print_to_string() == node.print_to_string();
        });

        AST_Scope.DEFMETHOD("process_expression", function(insert, compressor) {
            var self = this;
            var tt = new TreeTransformer(function(node) {
                if (insert && node instanceof AST_SimpleStatement) {
                    return make_node(AST_Return, node, {
                        value: node.body
                    });
                }
                if (!insert && node instanceof AST_Return) {
                    if (compressor) {
                        var value = node.value && node.value.drop_side_effect_free(compressor, true);
                        return value ? make_node(AST_SimpleStatement, node, {
                            body: value
                        }) : make_node(AST_EmptyStatement, node);
                    }
                    return make_node(AST_SimpleStatement, node, {
                        body: node.value || make_node(AST_UnaryPrefix, node, {
                            operator: "void",
                            expression: make_node(AST_Number, node, {
                                value: 0
                            })
                        })
                    });
                }
                if (node instanceof AST_Lambda && node !== self) {
                    return node;
                }
                if (node instanceof AST_Block) {
                    var index = node.body.length - 1;
                    if (index >= 0) {
                        node.body[index] = node.body[index].transform(tt);
                    }
                } else if (node instanceof AST_If) {
                    node.body = node.body.transform(tt);
                    if (node.alternative) {
                        node.alternative = node.alternative.transform(tt);
                    }
                } else if (node instanceof AST_With) {
                    node.body = node.body.transform(tt);
                }
                return node;
            });
            self.transform(tt);
        });

        (function(def){
            def(AST_Node, noop);

            function reset_def(compressor, def) {
                def.direct_access = false;
                def.escaped = false;
                if (def.scope.uses_eval || def.scope.uses_with) {
                    def.fixed = false;
                } else if (!compressor.exposed(def)) {
                    def.fixed = undefined;
                } else {
                    def.fixed = false;
                }
                def.recursive_refs = 0;
                def.references = [];
                def.should_replace = undefined;
                def.single_use = undefined;
            }

            function reset_variables(compressor, node) {
                node.variables.each(function(def) {
                    reset_def(compressor, def);
                });
            }

            function push(tw) {
                tw.safe_ids = Object.create(tw.safe_ids);
            }

            function pop(tw) {
                tw.safe_ids = Object.getPrototypeOf(tw.safe_ids);
            }

            function mark(tw, def, safe) {
                tw.safe_ids[def.id] = safe;
            }

            function safe_to_read(tw, def) {
                if (tw.safe_ids[def.id]) {
                    if (def.fixed == null) {
                        var orig = def.orig[0];
                        if (orig instanceof AST_SymbolFunarg || orig.name == "arguments") return false;
                        def.fixed = make_node(AST_Undefined, orig);
                    }
                    return true;
                }
                return def.fixed instanceof AST_Defun;
            }

            function safe_to_assign(tw, def, value) {
                if (!HOP(tw.safe_ids, def.id)) return false;
                if (!safe_to_read(tw, def)) return false;
                if (def.fixed === false) return false;
                if (def.fixed != null && (!value || def.references.length > 0)) return false;
                return all(def.orig, function(sym) {
                    return !(sym instanceof AST_SymbolDefun
                        || sym instanceof AST_SymbolLambda);
                });
            }

            function ref_once(tw, compressor, def) {
                return compressor.option("unused")
                    && !def.scope.uses_eval
                    && !def.scope.uses_with
                    && def.references.length - def.recursive_refs == 1
                    && tw.loop_ids[def.id] === tw.in_loop;
            }

            function is_immutable(value) {
                if (!value) return false;
                return value.is_constant()
                    || value instanceof AST_Lambda
                    || value instanceof AST_This;
            }

            function read_property(obj, key) {
                if (key instanceof AST_Constant) key = key.getValue();
                if (key instanceof AST_Node) return null;
                var value;
                if (obj instanceof AST_Array) {
                    var elements = obj.elements;
                    if (key == "length") return make_node_from_constant(elements.length, obj);
                    if (typeof key == "number" && key in elements) value = elements[key];
                } else if (obj instanceof AST_Object) {
                    var props = obj.properties;
                    for (var i = props.length; --i >= 0;) {
                        var prop = props[i];
                        if (!(prop instanceof AST_ObjectKeyVal)) return;
                        if (!value && props[i].key === key) value = props[i].value;
                    }
                }
                return value instanceof AST_SymbolRef && value.fixed_value() || value;
            }

            function is_modified(tw, node, value, level, immutable) {
                var parent = tw.parent(level);
                if (is_lhs(node, parent)
                    || !immutable
                    && parent instanceof AST_Call
                    && parent.expression === node
                    && (!(value instanceof AST_Function)
                        || !(parent instanceof AST_New) && value.contains_this())) {
                    return true;
                } else if (parent instanceof AST_Array) {
                    return is_modified(tw, parent, parent, level + 1);
                } else if (parent instanceof AST_ObjectKeyVal && node === parent.value) {
                    var obj = tw.parent(level + 1);
                    return is_modified(tw, obj, obj, level + 2);
                } else if (parent instanceof AST_PropAccess && parent.expression === node) {
                    return !immutable && is_modified(tw, parent, read_property(value, parent.property), level + 1);
                }
            }

            function mark_escaped(tw, d, scope, node, value, level, depth) {
                var parent = tw.parent(level);
                if (value && value.is_constant()) return;
                if (parent instanceof AST_Assign && parent.operator == "=" && node === parent.right
                    || parent instanceof AST_Call && node !== parent.expression
                    || parent instanceof AST_Exit && node === parent.value && node.scope !== d.scope
                    || parent instanceof AST_VarDef && node === parent.value) {
                    if (depth > 1 && !(value && value.is_constant_expression(scope))) depth = 1;
                    if (!d.escaped || d.escaped > depth) d.escaped = depth;
                    return;
                } else if (parent instanceof AST_Array
                    || parent instanceof AST_Binary && lazy_op(parent.operator)
                    || parent instanceof AST_Conditional && node !== parent.condition
                    || parent instanceof AST_Sequence && node === parent.tail_node()) {
                    mark_escaped(tw, d, scope, parent, parent, level + 1, depth);
                } else if (parent instanceof AST_ObjectKeyVal && node === parent.value) {
                    var obj = tw.parent(level + 1);
                    mark_escaped(tw, d, scope, obj, obj, level + 2, depth);
                } else if (parent instanceof AST_PropAccess && node === parent.expression) {
                    value = read_property(value, parent.property);
                    mark_escaped(tw, d, scope, parent, value, level + 1, depth + 1);
                    if (value) return;
                }
                if (level == 0) d.direct_access = true;
            }

            var suppressor = new TreeWalker(function(node) {
                if (!(node instanceof AST_Symbol)) return;
                var d = node.definition();
                if (!d) return;
                if (node instanceof AST_SymbolRef) d.references.push(node);
                d.fixed = false;
            });
            def(AST_Accessor, function(tw, descend) {
                push(tw);
                descend();
                pop(tw);
                return true;
            });
            def(AST_Assign, function(tw) {
                var node = this;
                if (node.operator != "=" || !(node.left instanceof AST_SymbolRef)) return;
                var d = node.left.definition();
                if (safe_to_assign(tw, d, node.right)
                    || d.fixed === undefined && all(d.orig, function(sym) {
                        return sym instanceof AST_SymbolVar;
                    })) {
                    d.references.push(node.left);
                    d.fixed = function() {
                        return node.right;
                    };
                    mark(tw, d, false);
                    node.right.walk(tw);
                    mark(tw, d, true);
                    return true;
                }
            });
            def(AST_Binary, function(tw) {
                if (!lazy_op(this.operator)) return;
                this.left.walk(tw);
                push(tw);
                this.right.walk(tw);
                pop(tw);
                return true;
            });
            def(AST_Conditional, function(tw) {
                this.condition.walk(tw);
                push(tw);
                this.consequent.walk(tw);
                pop(tw);
                push(tw);
                this.alternative.walk(tw);
                pop(tw);
                return true;
            });
            def(AST_Defun, function(tw, descend, compressor) {
                reset_variables(compressor, this);
                this.inlined = false;
                var d = this.name.definition();
                if (compressor.exposed(d) || safe_to_read(tw, d)) {
                    d.fixed = false;
                } else {
                    d.fixed = this;
                    d.single_use = ref_once(tw, compressor, d);
                    tw.loop_ids[d.id] = tw.in_loop;
                    mark(tw, d, true);
                }
                var save_ids = tw.safe_ids;
                tw.safe_ids = Object.create(null);
                descend();
                tw.safe_ids = save_ids;
                return true;
            });
            def(AST_Do, function(tw) {
                var saved_loop = tw.in_loop;
                tw.in_loop = this;
                push(tw);
                this.body.walk(tw);
                this.condition.walk(tw);
                pop(tw);
                tw.in_loop = saved_loop;
                return true;
            });
            def(AST_For, function(tw) {
                if (this.init) this.init.walk(tw);
                var saved_loop = tw.in_loop;
                tw.in_loop = this;
                if (this.condition) {
                    push(tw);
                    this.condition.walk(tw);
                    pop(tw);
                }
                push(tw);
                this.body.walk(tw);
                pop(tw);
                if (this.step) {
                    push(tw);
                    this.step.walk(tw);
                    pop(tw);
                }
                tw.in_loop = saved_loop;
                return true;
            });
            def(AST_ForIn, function(tw) {
                this.init.walk(suppressor);
                this.object.walk(tw);
                var saved_loop = tw.in_loop;
                tw.in_loop = this;
                push(tw);
                this.body.walk(tw);
                pop(tw);
                tw.in_loop = saved_loop;
                return true;
            });
            def(AST_Function, function(tw, descend, compressor) {
                var node = this;
                reset_variables(compressor, node);
                node.inlined = false;
                push(tw);
                var iife;
                if (!node.name
                    && (iife = tw.parent()) instanceof AST_Call
                    && iife.expression === node) {
                    // Virtually turn IIFE parameters into variable definitions:
                    //   (function(a,b) {...})(c,d) => (function() {var a=c,b=d; ...})()
                    // So existing transformation rules can work on them.
                    node.argnames.forEach(function(arg, i) {
                        var d = arg.definition();
                        if (!node.uses_arguments && d.fixed === undefined) {
                            d.fixed = function() {
                                return iife.args[i] || make_node(AST_Undefined, iife);
                            };
                            tw.loop_ids[d.id] = tw.in_loop;
                            mark(tw, d, true);
                        } else {
                            d.fixed = false;
                        }
                    });
                }
                descend();
                pop(tw);
                return true;
            });
            def(AST_If, function(tw) {
                this.condition.walk(tw);
                push(tw);
                this.body.walk(tw);
                pop(tw);
                if (this.alternative) {
                    push(tw);
                    this.alternative.walk(tw);
                    pop(tw);
                }
                return true;
            });
            def(AST_LabeledStatement, function(tw) {
                push(tw);
                this.body.walk(tw);
                pop(tw);
                return true;
            });
            def(AST_SwitchBranch, function(tw, descend) {
                push(tw);
                descend();
                pop(tw);
                return true;
            });
            def(AST_SymbolCatch, function() {
                this.definition().fixed = false;
            });
            def(AST_SymbolRef, function(tw, descend, compressor) {
                var d = this.definition();
                d.references.push(this);
                if (d.references.length == 1
                    && !d.fixed
                    && d.orig[0] instanceof AST_SymbolDefun) {
                    tw.loop_ids[d.id] = tw.in_loop;
                }
                var value;
                if (d.fixed === undefined || !safe_to_read(tw, d) || d.single_use == "m") {
                    d.fixed = false;
                } else if (d.fixed) {
                    value = this.fixed_value();
                    if (value instanceof AST_Lambda && recursive_ref(tw, d)) {
                        d.recursive_refs++;
                    } else if (value && ref_once(tw, compressor, d)) {
                        d.single_use = value instanceof AST_Lambda
                            || d.scope === this.scope && value.is_constant_expression();
                    } else {
                        d.single_use = false;
                    }
                    if (is_modified(tw, this, value, 0, is_immutable(value))) {
                        if (d.single_use) {
                            d.single_use = "m";
                        } else {
                            d.fixed = false;
                        }
                    }
                }
                mark_escaped(tw, d, this.scope, this, value, 0, 1);
            });
            def(AST_Toplevel, function(tw, descend, compressor) {
                this.globals.each(function(def) {
                    reset_def(compressor, def);
                });
                reset_variables(compressor, this);
            });
            def(AST_Try, function(tw) {
                push(tw);
                walk_body(this, tw);
                pop(tw);
                if (this.bcatch) {
                    push(tw);
                    this.bcatch.walk(tw);
                    pop(tw);
                }
                if (this.bfinally) this.bfinally.walk(tw);
                return true;
            });
            def(AST_VarDef, function(tw, descend) {
                var node = this;
                var d = node.name.definition();
                if (d.fixed === undefined || safe_to_assign(tw, d, node.value)) {
                    if (node.value) {
                        d.fixed = function() {
                            return node.value;
                        };
                        tw.loop_ids[d.id] = tw.in_loop;
                        mark(tw, d, false);
                        descend();
                    } else {
                        d.fixed = null;
                    }
                    mark(tw, d, true);
                    return true;
                } else if (node.value) {
                    d.fixed = false;
                }
            });
            def(AST_While, function(tw) {
                var saved_loop = tw.in_loop;
                tw.in_loop = this;
                push(tw);
                this.condition.walk(tw);
                this.body.walk(tw);
                pop(tw);
                tw.in_loop = saved_loop;
                return true;
            });
        })(function(node, func){
            node.DEFMETHOD("reduce_vars", func);
        });

        AST_Toplevel.DEFMETHOD("reset_opt_flags", function(compressor) {
            var reduce_vars = compressor.option("reduce_vars");
            var tw = new TreeWalker(function(node, descend) {
                node._squeezed = false;
                node._optimized = false;
                if (reduce_vars) return node.reduce_vars(tw, descend, compressor);
            });
            // Stack of look-up tables to keep track of whether a `SymbolDef` has been
            // properly assigned before use:
            // - `push()` & `pop()` when visiting conditional branches
            // - backup & restore via `save_ids` when visiting out-of-order sections
            tw.safe_ids = Object.create(null);
            tw.in_loop = null;
            tw.loop_ids = Object.create(null);
            this.walk(tw);
        });

        AST_Symbol.DEFMETHOD("fixed_value", function() {
            var fixed = this.definition().fixed;
            if (!fixed || fixed instanceof AST_Node) return fixed;
            return fixed();
        });

        AST_SymbolRef.DEFMETHOD("is_immutable", function() {
            var orig = this.definition().orig;
            return orig.length == 1 && orig[0] instanceof AST_SymbolLambda;
        });

        function is_lhs_read_only(lhs) {
            if (lhs instanceof AST_This) return true;
            if (lhs instanceof AST_SymbolRef) return lhs.definition().orig[0] instanceof AST_SymbolLambda;
            if (lhs instanceof AST_PropAccess) {
                lhs = lhs.expression;
                if (lhs instanceof AST_SymbolRef) {
                    if (lhs.is_immutable()) return false;
                    lhs = lhs.fixed_value();
                }
                if (!lhs) return true;
                if (lhs instanceof AST_RegExp) return false;
                if (lhs instanceof AST_Constant) return true;
                return is_lhs_read_only(lhs);
            }
            return false;
        }

        function find_variable(compressor, name) {
            var scope, i = 0;
            while (scope = compressor.parent(i++)) {
                if (scope instanceof AST_Scope) break;
                if (scope instanceof AST_Catch) {
                    scope = scope.argname.definition().scope;
                    break;
                }
            }
            return scope.find_variable(name);
        }

        function make_node(ctor, orig, props) {
            if (!props) props = {};
            if (orig) {
                if (!props.start) props.start = orig.start;
                if (!props.end) props.end = orig.end;
            }
            return new ctor(props);
        };

        function make_sequence(orig, expressions) {
            if (expressions.length == 1) return expressions[0];
            return make_node(AST_Sequence, orig, {
                expressions: expressions.reduce(merge_sequence, [])
            });
        }

        function make_node_from_constant(val, orig) {
            switch (typeof val) {
                case "string":
                    return make_node(AST_String, orig, {
                        value: val
                    });
                case "number":
                    if (isNaN(val)) return make_node(AST_NaN, orig);
                    if (isFinite(val)) {
                        return 1 / val < 0 ? make_node(AST_UnaryPrefix, orig, {
                            operator: "-",
                            expression: make_node(AST_Number, orig, { value: -val })
                        }) : make_node(AST_Number, orig, { value: val });
                    }
                    return val < 0 ? make_node(AST_UnaryPrefix, orig, {
                        operator: "-",
                        expression: make_node(AST_Infinity, orig)
                    }) : make_node(AST_Infinity, orig);
                case "boolean":
                    return make_node(val ? AST_True : AST_False, orig);
                case "undefined":
                    return make_node(AST_Undefined, orig);
                default:
                    if (val === null) {
                        return make_node(AST_Null, orig, { value: null });
                    }
                    if (val instanceof RegExp) {
                        return make_node(AST_RegExp, orig, { value: val });
                    }
                    throw new Error(string_template("Can't handle constant of type: {type}", {
                        type: typeof val
                    }));
            }
        };

        // we shouldn't compress (1,func)(something) to
        // func(something) because that changes the meaning of
        // the func (becomes lexical instead of global).
        function maintain_this_binding(parent, orig, val) {
            if (parent instanceof AST_UnaryPrefix && parent.operator == "delete"
                || parent instanceof AST_Call && parent.expression === orig
                && (val instanceof AST_PropAccess || val instanceof AST_SymbolRef && val.name == "eval")) {
                return make_sequence(orig, [ make_node(AST_Number, orig, { value: 0 }), val ]);
            }
            return val;
        }

        function merge_sequence(array, node) {
            if (node instanceof AST_Sequence) {
                array.push.apply(array, node.expressions);
            } else {
                array.push(node);
            }
            return array;
        }

        function as_statement_array(thing) {
            if (thing === null) return [];
            if (thing instanceof AST_BlockStatement) return thing.body;
            if (thing instanceof AST_EmptyStatement) return [];
            if (thing instanceof AST_Statement) return [ thing ];
            throw new Error("Can't convert thing to statement array");
        };

        function is_empty(thing) {
            if (thing === null) return true;
            if (thing instanceof AST_EmptyStatement) return true;
            if (thing instanceof AST_BlockStatement) return thing.body.length == 0;
            return false;
        };

        function loop_body(x) {
            if (x instanceof AST_Switch) return x;
            if (x instanceof AST_For || x instanceof AST_ForIn || x instanceof AST_DWLoop) {
                return (x.body instanceof AST_BlockStatement ? x.body : x);
            }
            return x;
        };

        function is_iife_call(node) {
            if (node.TYPE != "Call") return false;
            return node.expression instanceof AST_Function || is_iife_call(node.expression);
        }

        function is_undeclared_ref(node) {
            return node instanceof AST_SymbolRef && node.definition().undeclared;
        }

        var global_names = makePredicate("Array Boolean clearInterval clearTimeout console Date decodeURI decodeURIComponent encodeURI encodeURIComponent Error escape eval EvalError Function isFinite isNaN JSON Math Number parseFloat parseInt RangeError ReferenceError RegExp Object setInterval setTimeout String SyntaxError TypeError unescape URIError");
        AST_SymbolRef.DEFMETHOD("is_declared", function(compressor) {
            return !this.definition().undeclared
                || compressor.option("unsafe") && global_names(this.name);
        });

        var identifier_atom = makePredicate("Infinity NaN undefined");
        function is_identifier_atom(node) {
            return node instanceof AST_Infinity
                || node instanceof AST_NaN
                || node instanceof AST_Undefined;
        }

        function tighten_body(statements, compressor) {
            var CHANGED, max_iter = 10;
            do {
                CHANGED = false;
                eliminate_spurious_blocks(statements);
                if (compressor.option("dead_code")) {
                    eliminate_dead_code(statements, compressor);
                }
                if (compressor.option("if_return")) {
                    handle_if_return(statements, compressor);
                }
                if (compressor.sequences_limit > 0) {
                    sequencesize(statements, compressor);
                }
                if (compressor.option("join_vars")) {
                    join_consecutive_vars(statements, compressor);
                }
                if (compressor.option("collapse_vars")) {
                    collapse(statements, compressor);
                }
            } while (CHANGED && max_iter-- > 0);

            // Search from right to left for assignment-like expressions:
            // - `var a = x;`
            // - `a = x;`
            // - `++a`
            // For each candidate, scan from left to right for first usage, then try
            // to fold assignment into the site for compression.
            // Will not attempt to collapse assignments into or past code blocks
            // which are not sequentially executed, e.g. loops and conditionals.
            function collapse(statements, compressor) {
                var scope = compressor.find_parent(AST_Scope);
                if (scope.uses_eval || scope.uses_with) return statements;
                var args;
                var candidates = [];
                var in_try = compressor.self() instanceof AST_Try;
                var stat_index = statements.length;
                var scanner = new TreeTransformer(function(node, descend) {
                    if (abort) return node;
                    // Scan case expressions first in a switch statement
                    if (node instanceof AST_Switch) {
                        if (!hit) {
                            if (node !== hit_stack[hit_index]) return node;
                            hit_index++;
                        }
                        node.expression = node.expression.transform(scanner);
                        for (var i = 0, len = node.body.length; !abort && i < len; i++) {
                            var branch = node.body[i];
                            if (branch instanceof AST_Case) {
                                if (!hit) {
                                    if (branch !== hit_stack[hit_index]) continue;
                                    hit_index++;
                                }
                                branch.expression = branch.expression.transform(scanner);
                                if (side_effects || !replace_all) break;
                            }
                        }
                        abort = true;
                        return node;
                    }
                    // Skip nodes before `candidate` as quickly as possible
                    if (!hit) {
                        if (node !== hit_stack[hit_index]) return node;
                        hit_index++;
                        if (hit_index < hit_stack.length) return;
                        hit = true;
                        stop_after = find_stop(node, 0);
                        if (stop_after === node) abort = true;
                        return node;
                    }
                    // Stop immediately if these node types are encountered
                    var parent = scanner.parent();
                    if (node instanceof AST_Assign && node.operator != "=" && lhs.equivalent_to(node.left)
                        || node instanceof AST_Call && lhs instanceof AST_PropAccess && lhs.equivalent_to(node.expression)
                        || node instanceof AST_Debugger
                        || node instanceof AST_IterationStatement && !(node instanceof AST_For)
                        || node instanceof AST_Try
                        || node instanceof AST_With
                        || parent instanceof AST_For && node !== parent.init
                        || (side_effects || !replace_all)
                        && (node instanceof AST_SymbolRef && !node.is_declared(compressor))) {
                        abort = true;
                        return node;
                    }
                    // Replace variable with assignment when found
                    if (can_replace
                        && !(node instanceof AST_SymbolDeclaration)
                        && lhs.equivalent_to(node)) {
                        if (is_lhs(node, parent)) {
                            if (value_def) replaced++;
                            return node;
                        }
                        CHANGED = abort = true;
                        replaced++;
                        compressor.info("Collapsing {name} [{file}:{line},{col}]", {
                            name: node.print_to_string(),
                            file: node.start.file,
                            line: node.start.line,
                            col: node.start.col
                        });
                        if (candidate instanceof AST_UnaryPostfix) {
                            return make_node(AST_UnaryPrefix, candidate, candidate);
                        }
                        if (candidate instanceof AST_VarDef) {
                            if (value_def) {
                                abort = false;
                                return node;
                            }
                            var def = candidate.name.definition();
                            var value = candidate.value;
                            if (def.references.length - def.replaced == 1 && !compressor.exposed(def)) {
                                def.replaced++;
                                if (funarg && is_identifier_atom(value)) {
                                    return value.transform(compressor);
                                } else {
                                    return maintain_this_binding(parent, node, value);
                                }
                            }
                            return make_node(AST_Assign, candidate, {
                                operator: "=",
                                left: make_node(AST_SymbolRef, candidate.name, candidate.name),
                                right: value
                            });
                        }
                        candidate.write_only = false;
                        return candidate;
                    }
                    // These node types have child nodes that execute sequentially,
                    // but are otherwise not safe to scan into or beyond them.
                    var sym;
                    if (node instanceof AST_Call
                        || node instanceof AST_Exit
                        || node instanceof AST_PropAccess
                        && (side_effects || node.expression.may_throw_on_access(compressor))
                        || node instanceof AST_SymbolRef
                        && (lvalues[node.name]
                            || side_effects && !references_in_scope(node.definition()))
                        || (sym = lhs_or_def(node))
                        && (sym instanceof AST_PropAccess || sym.name in lvalues)
                        || may_throw
                        && (in_try ? node.has_side_effects(compressor) : side_effects_external(node))
                        || (side_effects || !replace_all)
                        && (parent instanceof AST_Binary && lazy_op(parent.operator)
                            || parent instanceof AST_Conditional
                            || parent instanceof AST_If)) {
                        stop_after = node;
                        if (node instanceof AST_Scope) abort = true;
                    }
                    // Skip (non-executed) functions
                    if (node instanceof AST_Scope) return node;
                }, function(node) {
                    if (!abort && stop_after === node) abort = true;
                });
                var multi_replacer = new TreeTransformer(function(node) {
                    if (abort) return node;
                    // Skip nodes before `candidate` as quickly as possible
                    if (!hit) {
                        if (node !== hit_stack[hit_index]) return node;
                        hit_index++;
                        if (hit_index < hit_stack.length) return;
                        hit = true;
                        return node;
                    }
                    // Replace variable when found
                    if (node instanceof AST_SymbolRef
                        && node.name == def.name) {
                        if (!--replaced) abort = true;
                        if (is_lhs(node, multi_replacer.parent())) return node;
                        def.replaced++;
                        value_def.replaced--;
                        return candidate.value;
                    }
                    // Skip (non-executed) functions and (leading) default case in switch statements
                    if (node instanceof AST_Default || node instanceof AST_Scope) return node;
                });
                while (--stat_index >= 0) {
                    // Treat parameters as collapsible in IIFE, i.e.
                    //   function(a, b){ ... }(x());
                    // would be translated into equivalent assignments:
                    //   var a = x(), b = undefined;
                    if (stat_index == 0 && compressor.option("unused")) extract_args();
                    // Find collapsible assignments
                    var hit_stack = [];
                    extract_candidates(statements[stat_index]);
                    while (candidates.length > 0) {
                        hit_stack = candidates.pop();
                        var hit_index = 0;
                        var candidate = hit_stack[hit_stack.length - 1];
                        var value_def = null;
                        var stop_after = null;
                        var lhs = get_lhs(candidate);
                        if (!lhs || is_lhs_read_only(lhs) || lhs.has_side_effects(compressor)) continue;
                        // Locate symbols which may execute code outside of scanning range
                        var lvalues = get_lvalues(candidate);
                        if (lhs instanceof AST_SymbolRef) lvalues[lhs.name] = false;
                        var replace_all = value_def;
                        if (!replace_all && lhs instanceof AST_SymbolRef) {
                            var def = lhs.definition();
                            if (def.references.length - def.replaced == (candidate instanceof AST_VarDef ? 1 : 2)) {
                                replace_all = true;
                            }
                        }
                        var side_effects = value_has_side_effects(candidate);
                        var may_throw = candidate.may_throw(compressor);
                        var funarg = candidate.name instanceof AST_SymbolFunarg;
                        var hit = funarg;
                        var abort = false, replaced = 0, can_replace = !args || !hit;
                        if (!can_replace) {
                            for (var j = compressor.self().argnames.lastIndexOf(candidate.name) + 1; !abort && j < args.length; j++) {
                                args[j].transform(scanner);
                            }
                            can_replace = true;
                        }
                        for (var i = stat_index; !abort && i < statements.length; i++) {
                            statements[i].transform(scanner);
                        }
                        if (value_def) {
                            var def = candidate.name.definition();
                            if (abort && def.references.length - def.replaced > replaced) replaced = false;
                            else {
                                abort = false;
                                hit_index = 0;
                                hit = funarg;
                                for (var i = stat_index; !abort && i < statements.length; i++) {
                                    statements[i].transform(multi_replacer);
                                }
                                value_def.single_use = false;
                            }
                        }
                        if (replaced && !remove_candidate(candidate)) statements.splice(stat_index, 1);
                    }
                }

                function extract_args() {
                    var iife, fn = compressor.self();
                    if (fn instanceof AST_Function
                        && !fn.name
                        && !fn.uses_arguments
                        && !fn.uses_eval
                        && (iife = compressor.parent()) instanceof AST_Call
                        && iife.expression === fn) {
                        var fn_strict = compressor.has_directive("use strict");
                        if (fn_strict && !member(fn_strict, fn.body)) fn_strict = false;
                        var len = fn.argnames.length;
                        args = iife.args.slice(len);
                        var names = Object.create(null);
                        for (var i = len; --i >= 0;) {
                            var sym = fn.argnames[i];
                            var arg = iife.args[i];
                            args.unshift(make_node(AST_VarDef, sym, {
                                name: sym,
                                value: arg
                            }));
                            if (sym.name in names) continue;
                            names[sym.name] = true;
                            if (!arg) arg = make_node(AST_Undefined, sym).transform(compressor);
                            else {
                                var tw = new TreeWalker(function(node) {
                                    if (!arg) return true;
                                    if (node instanceof AST_SymbolRef && fn.variables.has(node.name)) {
                                        var s = node.definition().scope;
                                        if (s !== scope) while (s = s.parent_scope) {
                                            if (s === scope) return true;
                                        }
                                        arg = null;
                                    }
                                    if (node instanceof AST_This && (fn_strict || !tw.find_parent(AST_Scope))) {
                                        arg = null;
                                        return true;
                                    }
                                });
                                arg.walk(tw);
                            }
                            if (arg) candidates.unshift([ make_node(AST_VarDef, sym, {
                                name: sym,
                                value: arg
                            }) ]);
                        }
                    }
                }

                function extract_candidates(expr) {
                    hit_stack.push(expr);
                    if (expr instanceof AST_Assign) {
                        if (!expr.left.has_side_effects(compressor)) {
                            candidates.push(hit_stack.slice());
                        }
                    } else if (expr instanceof AST_Unary) {
                        if (expr.operator == "++" || expr.operator == "--") {
                            candidates.push(hit_stack.slice());
                        }
                    } else if (expr instanceof AST_Call) {
                        extract_candidates(expr.expression);
                        expr.args.forEach(extract_candidates);
                    } else if (expr instanceof AST_Case) {
                        extract_candidates(expr.expression);
                    } else if (expr instanceof AST_Conditional) {
                        extract_candidates(expr.condition);
                        extract_candidates(expr.consequent);
                        extract_candidates(expr.alternative);
                    } else if (expr instanceof AST_Definitions) {
                        expr.definitions.forEach(extract_candidates);
                    } else if (expr instanceof AST_Exit) {
                        if (expr.value) extract_candidates(expr.value);
                    } else if (expr instanceof AST_For) {
                        if (expr.init) extract_candidates(expr.init);
                    } else if (expr instanceof AST_If) {
                        extract_candidates(expr.condition);
                    } else if (expr instanceof AST_Sequence) {
                        expr.expressions.forEach(extract_candidates);
                    } else if (expr instanceof AST_SimpleStatement) {
                        extract_candidates(expr.body);
                    } else if (expr instanceof AST_Switch) {
                        extract_candidates(expr.expression);
                        expr.body.forEach(extract_candidates);
                    } else if (expr instanceof AST_VarDef) {
                        if (expr.value) candidates.push(hit_stack.slice());
                    }
                    hit_stack.pop();
                }

                function find_stop(node, level) {
                    var parent = scanner.parent(level);
                    if (parent instanceof AST_Call) return node;
                    if (parent instanceof AST_Case) return node;
                    if (parent instanceof AST_Conditional) return node;
                    if (parent instanceof AST_Exit) return node;
                    if (parent instanceof AST_If) return node;
                    if (parent instanceof AST_Sequence) return find_stop(parent, level + 1);
                    if (parent instanceof AST_Switch) return node;
                    return null;
                }

                function mangleable_var(var_def) {
                    var value = var_def.value;
                    if (!(value instanceof AST_SymbolRef)) return;
                    if (value.name == "arguments") return;
                    var def = value.definition();
                    if (def.undeclared) return;
                    return value_def = def;
                }

                function get_lhs(expr) {
                    if (expr instanceof AST_VarDef) {
                        var def = expr.name.definition();
                        if (!member(expr.name, def.orig)) return;
                        var declared = def.orig.length - def.eliminated;
                        var referenced = def.references.length - def.replaced;
                        if (declared > 1 && !(expr.name instanceof AST_SymbolFunarg)
                            || (referenced > 1 ? mangleable_var(expr) : !compressor.exposed(def))) {
                            return make_node(AST_SymbolRef, expr.name, expr.name);
                        }
                    } else {
                        return expr[expr instanceof AST_Assign ? "left" : "expression"];
                    }
                }

                function get_rvalue(expr) {
                    return expr[expr instanceof AST_Assign ? "right" : "value"];
                }

                function get_lvalues(expr) {
                    var lvalues = Object.create(null);
                    if (expr instanceof AST_Unary) return lvalues;
                    var tw = new TreeWalker(function(node, descend) {
                        var sym = node;
                        while (sym instanceof AST_PropAccess) sym = sym.expression;
                        if (sym instanceof AST_SymbolRef || sym instanceof AST_This) {
                            lvalues[sym.name] = lvalues[sym.name] || is_lhs(node, tw.parent());
                        }
                    });
                    get_rvalue(expr).walk(tw);
                    return lvalues;
                }

                function lhs_or_def(node) {
                    if (node instanceof AST_VarDef) return node.value && node.name;
                    return is_lhs(node.left, node);
                }

                function remove_candidate(expr) {
                    if (expr.name instanceof AST_SymbolFunarg) {
                        var index = compressor.self().argnames.indexOf(expr.name);
                        var args = compressor.parent().args;
                        if (args[index]) args[index] = make_node(AST_Number, args[index], {
                            value: 0
                        });
                        return true;
                    }
                    var found = false;
                    return statements[stat_index].transform(new TreeTransformer(function(node, descend, in_list) {
                        if (found) return node;
                        if (node === expr || node.body === expr) {
                            found = true;
                            if (node instanceof AST_VarDef) {
                                node.value = null;
                                return node;
                            }
                            return in_list ? MAP.skip : null;
                        }
                    }, function(node) {
                        if (node instanceof AST_Sequence) switch (node.expressions.length) {
                            case 0: return null;
                            case 1: return node.expressions[0];
                        }
                    }));
                }

                function value_has_side_effects(expr) {
                    if (expr instanceof AST_Unary) return false;
                    return get_rvalue(expr).has_side_effects(compressor);
                }

                function references_in_scope(def) {
                    if (def.orig.length == 1 && def.orig[0] instanceof AST_SymbolDefun) return true;
                    if (def.scope !== scope) return false;
                    return def.references.every(function(ref) {
                        return ref.scope === scope;
                    });
                }

                function side_effects_external(node, lhs) {
                    if (node instanceof AST_Assign) {
                        return side_effects_external(node.left, true)
                            || side_effects_external(node.right);
                    }
                    if (node instanceof AST_Definitions) return false;
                    if (node instanceof AST_Unary) return side_effects_external(node.expression, true);
                    if (node instanceof AST_VarDef) return node.value && side_effects_external(node.value);
                    if (lhs) {
                        if (node instanceof AST_Dot) return side_effects_external(node.expression, true);
                        if (node instanceof AST_Sub) {
                            return side_effects_external(node.expression, true)
                                || side_effects_external(node.property);
                        }
                        if (node instanceof AST_SymbolRef) return node.definition().scope !== scope;
                    }
                    return node.has_side_effects(compressor);
                }
            }

            function eliminate_spurious_blocks(statements) {
                var seen_dirs = [];
                for (var i = 0; i < statements.length;) {
                    var stat = statements[i];
                    if (stat instanceof AST_BlockStatement) {
                        CHANGED = true;
                        eliminate_spurious_blocks(stat.body);
                        [].splice.apply(statements, [i, 1].concat(stat.body));
                        i += stat.body.length;
                    } else if (stat instanceof AST_EmptyStatement) {
                        CHANGED = true;
                        statements.splice(i, 1);
                    } else if (stat instanceof AST_Directive) {
                        if (seen_dirs.indexOf(stat.value) < 0) {
                            i++;
                            seen_dirs.push(stat.value);
                        } else {
                            CHANGED = true;
                            statements.splice(i, 1);
                        }
                    } else i++;
                }
            }

            function handle_if_return(statements, compressor) {
                var self = compressor.self();
                var multiple_if_returns = has_multiple_if_returns(statements);
                var in_lambda = self instanceof AST_Lambda;
                for (var i = statements.length; --i >= 0;) {
                    var stat = statements[i];
                    var next = statements[i + 1];

                    if (in_lambda && !next && stat instanceof AST_Return) {
                        if (!stat.value) {
                            CHANGED = true;
                            statements.length--;
                            continue;
                        }
                        if (stat.value instanceof AST_UnaryPrefix && stat.value.operator == "void") {
                            CHANGED = true;
                            statements[i] = make_node(AST_SimpleStatement, stat, {
                                body: stat.value.expression
                            });
                            continue;
                        }
                    }

                    if (stat instanceof AST_If) {
                        var ab = aborts(stat.body);
                        if (can_merge_flow(ab)) {
                            if (ab.label) {
                                remove(ab.label.thedef.references, ab);
                            }
                            CHANGED = true;
                            stat = stat.clone();
                            stat.condition = stat.condition.negate(compressor);
                            var body = as_statement_array_with_return(stat.body, ab);
                            stat.body = make_node(AST_BlockStatement, stat, {
                                body: as_statement_array(stat.alternative).concat(extract_functions())
                            });
                            stat.alternative = make_node(AST_BlockStatement, stat, {
                                body: body
                            });
                            statements[i] = stat.transform(compressor);
                            continue;
                        }

                        var ab = aborts(stat.alternative);
                        if (can_merge_flow(ab)) {
                            if (ab.label) {
                                remove(ab.label.thedef.references, ab);
                            }
                            CHANGED = true;
                            stat = stat.clone();
                            stat.body = make_node(AST_BlockStatement, stat.body, {
                                body: as_statement_array(stat.body).concat(extract_functions())
                            });
                            var body = as_statement_array_with_return(stat.alternative, ab);
                            stat.alternative = make_node(AST_BlockStatement, stat.alternative, {
                                body: body
                            });
                            statements[i] = stat.transform(compressor);
                            continue;
                        }
                    }

                    if (stat instanceof AST_If && stat.body instanceof AST_Return) {
                        var value = stat.body.value;
                        //---
                        // pretty silly case, but:
                        // if (foo()) return; return; ==> foo(); return;
                        if (!value && !stat.alternative
                            && (in_lambda && !next || next instanceof AST_Return && !next.value)) {
                            CHANGED = true;
                            statements[i] = make_node(AST_SimpleStatement, stat.condition, {
                                body: stat.condition
                            });
                            continue;
                        }
                        //---
                        // if (foo()) return x; return y; ==> return foo() ? x : y;
                        if (value && !stat.alternative && next instanceof AST_Return && next.value) {
                            CHANGED = true;
                            stat = stat.clone();
                            stat.alternative = next;
                            statements.splice(i, 2, stat.transform(compressor));
                            continue;
                        }
                        //---
                        // if (foo()) return x; [ return ; ] ==> return foo() ? x : undefined;
                        if (multiple_if_returns && in_lambda && value && !stat.alternative
                            && (!next || next instanceof AST_Return)) {
                            CHANGED = true;
                            stat = stat.clone();
                            stat.alternative = next || make_node(AST_Return, stat, {
                                value: null
                            });
                            statements.splice(i, next ? 2 : 1, stat.transform(compressor));
                            continue;
                        }
                        //---
                        // if (a) return b; if (c) return d; e; ==> return a ? b : c ? d : void e;
                        //
                        // if sequences is not enabled, this can lead to an endless loop (issue #866).
                        // however, with sequences on this helps producing slightly better output for
                        // the example code.
                        var prev = statements[i - 1];
                        if (compressor.option("sequences") && in_lambda && !stat.alternative
                            && prev instanceof AST_If && prev.body instanceof AST_Return
                            && i + 2 == statements.length && next instanceof AST_SimpleStatement) {
                            CHANGED = true;
                            stat = stat.clone();
                            stat.alternative = make_node(AST_BlockStatement, next, {
                                body: [
                                    next,
                                    make_node(AST_Return, next, {
                                        value: null
                                    })
                                ]
                            });
                            statements.splice(i, 2, stat.transform(compressor));
                            continue;
                        }
                    }
                }

                function has_multiple_if_returns(statements) {
                    var n = 0;
                    for (var i = statements.length; --i >= 0;) {
                        var stat = statements[i];
                        if (stat instanceof AST_If && stat.body instanceof AST_Return) {
                            if (++n > 1) return true;
                        }
                    }
                    return false;
                }

                function is_return_void(value) {
                    return !value || value instanceof AST_UnaryPrefix && value.operator == "void";
                }

                function can_merge_flow(ab) {
                    if (!ab) return false;
                    var lct = ab instanceof AST_LoopControl ? compressor.loopcontrol_target(ab) : null;
                    return ab instanceof AST_Return && in_lambda && is_return_void(ab.value)
                        || ab instanceof AST_Continue && self === loop_body(lct)
                        || ab instanceof AST_Break && lct instanceof AST_BlockStatement && self === lct;
                }

                function extract_functions() {
                    var tail = statements.slice(i + 1);
                    statements.length = i + 1;
                    return tail.filter(function(stat) {
                        if (stat instanceof AST_Defun) {
                            statements.push(stat);
                            return false;
                        }
                        return true;
                    });
                }

                function as_statement_array_with_return(node, ab) {
                    var body = as_statement_array(node).slice(0, -1);
                    if (ab.value) {
                        body.push(make_node(AST_SimpleStatement, ab.value, {
                            body: ab.value.expression
                        }));
                    }
                    return body;
                }
            }

            function eliminate_dead_code(statements, compressor) {
                var has_quit;
                var self = compressor.self();
                for (var i = 0, n = 0, len = statements.length; i < len; i++) {
                    var stat = statements[i];
                    if (stat instanceof AST_LoopControl) {
                        var lct = compressor.loopcontrol_target(stat);
                        if (stat instanceof AST_Break
                            && !(lct instanceof AST_IterationStatement)
                            && loop_body(lct) === self
                            || stat instanceof AST_Continue
                            && loop_body(lct) === self) {
                            if (stat.label) {
                                remove(stat.label.thedef.references, stat);
                            }
                        } else {
                            statements[n++] = stat;
                        }
                    } else {
                        statements[n++] = stat;
                    }
                    if (aborts(stat)) {
                        has_quit = statements.slice(i + 1);
                        break;
                    }
                }
                statements.length = n;
                CHANGED = n != len;
                if (has_quit) has_quit.forEach(function(stat) {
                    extract_declarations_from_unreachable_code(compressor, stat, statements);
                });
            }

            function sequencesize(statements, compressor) {
                if (statements.length < 2) return;
                var seq = [], n = 0;
                function push_seq() {
                    if (!seq.length) return;
                    var body = make_sequence(seq[0], seq);
                    statements[n++] = make_node(AST_SimpleStatement, body, { body: body });
                    seq = [];
                }
                for (var i = 0, len = statements.length; i < len; i++) {
                    var stat = statements[i];
                    if (stat instanceof AST_SimpleStatement) {
                        if (seq.length >= compressor.sequences_limit) push_seq();
                        var body = stat.body;
                        if (seq.length > 0) body = body.drop_side_effect_free(compressor);
                        if (body) merge_sequence(seq, body);
                    } else {
                        push_seq();
                        statements[n++] = stat;
                    }
                }
                push_seq();
                statements.length = n;
                sequencesize_2(statements, compressor);
                CHANGED = statements.length != len;
            }

            function sequencesize_2(statements, compressor) {
                function cons_seq(right) {
                    n--;
                    var left = prev.body;
                    return make_sequence(left, [ left, right ]).transform(compressor);
                };
                var n = 0, prev;
                for (var i = 0, len = statements.length; i < len; i++) {
                    var stat = statements[i];
                    if (prev) {
                        if (stat instanceof AST_For && !(stat.init instanceof AST_Definitions)) {
                            var abort = false;
                            prev.body.walk(new TreeWalker(function(node) {
                                if (abort || node instanceof AST_Scope) return true;
                                if (node instanceof AST_Binary && node.operator == "in") {
                                    abort = true;
                                    return true;
                                }
                            }));
                            if (!abort) {
                                if (stat.init) stat.init = cons_seq(stat.init);
                                else {
                                    stat.init = prev.body;
                                    n--;
                                }
                            }
                        }
                        else if (stat instanceof AST_If) {
                            stat.condition = cons_seq(stat.condition);
                        }
                        else if (stat instanceof AST_With) {
                            stat.expression = cons_seq(stat.expression);
                        }
                        else if (stat instanceof AST_Exit && stat.value) {
                            stat.value = cons_seq(stat.value);
                        }
                        else if (stat instanceof AST_Exit) {
                            stat.value = cons_seq(make_node(AST_Undefined, stat).transform(compressor));
                        }
                        else if (stat instanceof AST_Switch) {
                            stat.expression = cons_seq(stat.expression);
                        }
                    }
                    statements[n++] = stat;
                    prev = stat instanceof AST_SimpleStatement ? stat : null;
                }
                statements.length = n;
            }

            function join_consecutive_vars(statements, compressor) {
                for (var i = 0, j = -1, len = statements.length; i < len; i++) {
                    var stat = statements[i];
                    var prev = statements[j];
                    if (stat instanceof AST_Definitions && prev && prev.TYPE == stat.TYPE) {
                        prev.definitions = prev.definitions.concat(stat.definitions);
                        CHANGED = true;
                    }
                    else if (stat instanceof AST_For
                        && prev instanceof AST_Var
                        && (!stat.init || stat.init.TYPE == prev.TYPE)) {
                        CHANGED = true;
                        if (stat.init) {
                            stat.init.definitions = prev.definitions.concat(stat.init.definitions);
                        } else {
                            stat.init = prev;
                        }
                        statements[j] = stat;
                    }
                    else {
                        statements[++j] = stat;
                    }
                }
                statements.length = j + 1;
            };
        }

        function extract_declarations_from_unreachable_code(compressor, stat, target) {
            if (!(stat instanceof AST_Defun)) {
                compressor.warn("Dropping unreachable code [{file}:{line},{col}]", stat.start);
            }
            stat.walk(new TreeWalker(function(node){
                if (node instanceof AST_Definitions) {
                    compressor.warn("Declarations in unreachable code! [{file}:{line},{col}]", node.start);
                    node.remove_initializers();
                    target.push(node);
                    return true;
                }
                if (node instanceof AST_Defun && (node === stat || !compressor.has_directive("use strict"))) {
                    target.push(node);
                    return true;
                }
                if (node instanceof AST_Scope) {
                    return true;
                }
            }));
        };

        function is_undefined(node, compressor) {
            return node.is_undefined
                || node instanceof AST_Undefined
                || node instanceof AST_UnaryPrefix
                && node.operator == "void"
                && !node.expression.has_side_effects(compressor);
        }

        // may_throw_on_access()
        // returns true if this node may be null, undefined or contain `AST_Accessor`
        (function(def) {
            AST_Node.DEFMETHOD("may_throw_on_access", function(compressor) {
                return !compressor.option("pure_getters")
                    || this._dot_throw(compressor);
            });

            function is_strict(compressor) {
                return /strict/.test(compressor.option("pure_getters"));
            }

            def(AST_Node, is_strict);
            def(AST_Null, return_true);
            def(AST_Undefined, return_true);
            def(AST_Constant, return_false);
            def(AST_Array, return_false);
            def(AST_Object, function(compressor) {
                if (!is_strict(compressor)) return false;
                for (var i = this.properties.length; --i >=0;)
                    if (this.properties[i].value instanceof AST_Accessor) return true;
                return false;
            });
            def(AST_Function, return_false);
            def(AST_UnaryPostfix, return_false);
            def(AST_UnaryPrefix, function() {
                return this.operator == "void";
            });
            def(AST_Binary, function(compressor) {
                return (this.operator == "&&" || this.operator == "||")
                    && (this.left._dot_throw(compressor) || this.right._dot_throw(compressor));
            })
            def(AST_Assign, function(compressor) {
                return this.operator == "="
                    && this.right._dot_throw(compressor);
            })
            def(AST_Conditional, function(compressor) {
                return this.consequent._dot_throw(compressor)
                    || this.alternative._dot_throw(compressor);
            })
            def(AST_Dot, function(compressor) {
                if (!is_strict(compressor)) return false;
                if (this.expression instanceof AST_Function && this.property == "prototype") return false;
                return true;
            });
            def(AST_Sequence, function(compressor) {
                return this.tail_node()._dot_throw(compressor);
            });
            def(AST_SymbolRef, function(compressor) {
                if (this.is_undefined) return true;
                if (!is_strict(compressor)) return false;
                if (is_undeclared_ref(this) && this.is_declared(compressor)) return false;
                if (this.is_immutable()) return false;
                var fixed = this.fixed_value();
                return !fixed || fixed._dot_throw(compressor);
            });
        })(function(node, func) {
            node.DEFMETHOD("_dot_throw", func);
        });

        /* -----[ boolean/negation helpers ]----- */

        // methods to determine whether an expression has a boolean result type
        (function(def){
            var unary_bool = [ "!", "delete" ];
            var binary_bool = [ "in", "instanceof", "==", "!=", "===", "!==", "<", "<=", ">=", ">" ];
            def(AST_Node, return_false);
            def(AST_UnaryPrefix, function(){
                return member(this.operator, unary_bool);
            });
            def(AST_Binary, function(){
                return member(this.operator, binary_bool)
                    || lazy_op(this.operator)
                    && this.left.is_boolean()
                    && this.right.is_boolean();
            });
            def(AST_Conditional, function(){
                return this.consequent.is_boolean() && this.alternative.is_boolean();
            });
            def(AST_Assign, function(){
                return this.operator == "=" && this.right.is_boolean();
            });
            def(AST_Sequence, function(){
                return this.tail_node().is_boolean();
            });
            def(AST_True, return_true);
            def(AST_False, return_true);
        })(function(node, func){
            node.DEFMETHOD("is_boolean", func);
        });

        // methods to determine if an expression has a numeric result type
        (function(def){
            def(AST_Node, return_false);
            def(AST_Number, return_true);
            var unary = makePredicate("+ - ~ ++ --");
            def(AST_Unary, function(){
                return unary(this.operator);
            });
            var binary = makePredicate("- * / % & | ^ << >> >>>");
            def(AST_Binary, function(compressor){
                return binary(this.operator) || this.operator == "+"
                    && this.left.is_number(compressor)
                    && this.right.is_number(compressor);
            });
            def(AST_Assign, function(compressor){
                return binary(this.operator.slice(0, -1))
                    || this.operator == "=" && this.right.is_number(compressor);
            });
            def(AST_Sequence, function(compressor){
                return this.tail_node().is_number(compressor);
            });
            def(AST_Conditional, function(compressor){
                return this.consequent.is_number(compressor) && this.alternative.is_number(compressor);
            });
        })(function(node, func){
            node.DEFMETHOD("is_number", func);
        });

        // methods to determine if an expression has a string result type
        (function(def){
            def(AST_Node, return_false);
            def(AST_String, return_true);
            def(AST_UnaryPrefix, function(){
                return this.operator == "typeof";
            });
            def(AST_Binary, function(compressor){
                return this.operator == "+" &&
                    (this.left.is_string(compressor) || this.right.is_string(compressor));
            });
            def(AST_Assign, function(compressor){
                return (this.operator == "=" || this.operator == "+=") && this.right.is_string(compressor);
            });
            def(AST_Sequence, function(compressor){
                return this.tail_node().is_string(compressor);
            });
            def(AST_Conditional, function(compressor){
                return this.consequent.is_string(compressor) && this.alternative.is_string(compressor);
            });
        })(function(node, func){
            node.DEFMETHOD("is_string", func);
        });

        var lazy_op = makePredicate("&& ||");
        var unary_side_effects = makePredicate("delete ++ --");

        function is_lhs(node, parent) {
            if (parent instanceof AST_Unary && unary_side_effects(parent.operator)) return parent.expression;
            if (parent instanceof AST_Assign && parent.left === node) return node;
        }

        (function(def){
            AST_Node.DEFMETHOD("resolve_defines", function(compressor) {
                if (!compressor.option("global_defs")) return;
                var def = this._find_defs(compressor, "");
                if (def) {
                    var node, parent = this, level = 0;
                    do {
                        node = parent;
                        parent = compressor.parent(level++);
                    } while (parent instanceof AST_PropAccess && parent.expression === node);
                    if (is_lhs(node, parent)) {
                        compressor.warn('global_defs ' + this.print_to_string() + ' redefined [{file}:{line},{col}]', this.start);
                    } else {
                        return def;
                    }
                }
            });
            function to_node(value, orig) {
                if (value instanceof AST_Node) return make_node(value.CTOR, orig, value);
                if (Array.isArray(value)) return make_node(AST_Array, orig, {
                    elements: value.map(function(value) {
                        return to_node(value, orig);
                    })
                });
                if (value && typeof value == "object") {
                    var props = [];
                    for (var key in value) if (HOP(value, key)) {
                        props.push(make_node(AST_ObjectKeyVal, orig, {
                            key: key,
                            value: to_node(value[key], orig)
                        }));
                    }
                    return make_node(AST_Object, orig, {
                        properties: props
                    });
                }
                return make_node_from_constant(value, orig);
            }
            def(AST_Node, noop);
            def(AST_Dot, function(compressor, suffix){
                return this.expression._find_defs(compressor, "." + this.property + suffix);
            });
            def(AST_SymbolRef, function(compressor, suffix){
                if (!this.global()) return;
                var name;
                var defines = compressor.option("global_defs");
                if (defines && HOP(defines, (name = this.name + suffix))) {
                    var node = to_node(defines[name], this);
                    var top = compressor.find_parent(AST_Toplevel);
                    node.walk(new TreeWalker(function(node) {
                        if (node instanceof AST_SymbolRef) {
                            node.scope = top;
                            node.thedef = top.def_global(node);
                        }
                    }));
                    return node;
                }
            });
        })(function(node, func){
            node.DEFMETHOD("_find_defs", func);
        });

        function best_of_expression(ast1, ast2) {
            return ast1.print_to_string().length >
            ast2.print_to_string().length
                ? ast2 : ast1;
        }

        function best_of_statement(ast1, ast2) {
            return best_of_expression(make_node(AST_SimpleStatement, ast1, {
                body: ast1
            }), make_node(AST_SimpleStatement, ast2, {
                body: ast2
            })).body;
        }

        function best_of(compressor, ast1, ast2) {
            return (first_in_statement(compressor) ? best_of_statement : best_of_expression)(ast1, ast2);
        }

        // methods to evaluate a constant expression
        (function(def){
            // If the node has been successfully reduced to a constant,
            // then its value is returned; otherwise the element itself
            // is returned.
            // They can be distinguished as constant value is never a
            // descendant of AST_Node.
            AST_Node.DEFMETHOD("evaluate", function(compressor){
                if (!compressor.option("evaluate")) return this;
                var val = this._eval(compressor, 1);
                return !val || val instanceof RegExp || typeof val != "object" ? val : this;
            });
            var unaryPrefix = makePredicate("! ~ - + void");
            AST_Node.DEFMETHOD("is_constant", function(){
                // Accomodate when compress option evaluate=false
                // as well as the common constant expressions !0 and -1
                if (this instanceof AST_Constant) {
                    return !(this instanceof AST_RegExp);
                } else {
                    return this instanceof AST_UnaryPrefix
                        && this.expression instanceof AST_Constant
                        && unaryPrefix(this.operator);
                }
            });
            def(AST_Statement, function(){
                throw new Error(string_template("Cannot evaluate a statement [{file}:{line},{col}]", this.start));
            });
            def(AST_Lambda, return_this);
            def(AST_Node, return_this);
            def(AST_Constant, function(){
                return this.getValue();
            });
            def(AST_Array, function(compressor, depth) {
                if (compressor.option("unsafe")) {
                    var elements = [];
                    for (var i = 0, len = this.elements.length; i < len; i++) {
                        var element = this.elements[i];
                        if (element instanceof AST_Function) continue;
                        var value = element._eval(compressor, depth);
                        if (element === value) return this;
                        elements.push(value);
                    }
                    return elements;
                }
                return this;
            });
            def(AST_Object, function(compressor, depth) {
                if (compressor.option("unsafe")) {
                    var val = {};
                    for (var i = 0, len = this.properties.length; i < len; i++) {
                        var prop = this.properties[i];
                        var key = prop.key;
                        if (key instanceof AST_Symbol) {
                            key = key.name;
                        } else if (key instanceof AST_Node) {
                            key = key._eval(compressor, depth);
                            if (key === prop.key) return this;
                        }
                        if (typeof Object.prototype[key] === 'function') {
                            return this;
                        }
                        if (prop.value instanceof AST_Function) continue;
                        val[key] = prop.value._eval(compressor, depth);
                        if (val[key] === prop.value) return this;
                    }
                    return val;
                }
                return this;
            });
            def(AST_UnaryPrefix, function(compressor, depth) {
                var e = this.expression;
                // Function would be evaluated to an array and so typeof would
                // incorrectly return 'object'. Hence making is a special case.
                if (compressor.option("typeofs")
                    && this.operator == "typeof"
                    && (e instanceof AST_Lambda
                        || e instanceof AST_SymbolRef
                        && e.fixed_value() instanceof AST_Lambda)) {
                    return typeof function(){};
                }
                e = e._eval(compressor, depth);
                if (e === this.expression) return this;
                switch (this.operator) {
                    case "!": return !e;
                    case "typeof":
                        // typeof <RegExp> returns "object" or "function" on different platforms
                        // so cannot evaluate reliably
                        if (e instanceof RegExp) return this;
                        return typeof e;
                    case "void": return void e;
                    case "~": return ~e;
                    case "-": return -e;
                    case "+": return +e;
                }
                return this;
            });
            def(AST_Binary, function(compressor, depth) {
                var left = this.left._eval(compressor, depth);
                if (left === this.left) return this;
                var right = this.right._eval(compressor, depth);
                if (right === this.right) return this;
                var result;
                switch (this.operator) {
                    case "&&"  : result = left &&  right; break;
                    case "||"  : result = left ||  right; break;
                    case "|"   : result = left |   right; break;
                    case "&"   : result = left &   right; break;
                    case "^"   : result = left ^   right; break;
                    case "+"   : result = left +   right; break;
                    case "*"   : result = left *   right; break;
                    case "/"   : result = left /   right; break;
                    case "%"   : result = left %   right; break;
                    case "-"   : result = left -   right; break;
                    case "<<"  : result = left <<  right; break;
                    case ">>"  : result = left >>  right; break;
                    case ">>>" : result = left >>> right; break;
                    case "=="  : result = left ==  right; break;
                    case "===" : result = left === right; break;
                    case "!="  : result = left !=  right; break;
                    case "!==" : result = left !== right; break;
                    case "<"   : result = left <   right; break;
                    case "<="  : result = left <=  right; break;
                    case ">"   : result = left >   right; break;
                    case ">="  : result = left >=  right; break;
                    default:
                        return this;
                }
                if (isNaN(result) && compressor.find_parent(AST_With)) {
                    // leave original expression as is
                    return this;
                }
                return result;
            });
            def(AST_Conditional, function(compressor, depth) {
                var condition = this.condition._eval(compressor, depth);
                if (condition === this.condition) return this;
                var node = condition ? this.consequent : this.alternative;
                var value = node._eval(compressor, depth);
                return value === node ? this : value;
            });
            def(AST_SymbolRef, function(compressor, depth) {
                var fixed = this.fixed_value();
                if (!fixed) return this;
                var value;
                if (HOP(fixed, "_eval")) {
                    value = fixed._eval();
                } else {
                    this._eval = return_this;
                    value = fixed._eval(compressor, depth);
                    delete this._eval;
                    if (value === fixed) return this;
                    fixed._eval = function() {
                        return value;
                    };
                }
                if (value && typeof value == "object") {
                    var escaped = this.definition().escaped;
                    if (escaped && depth > escaped) return this;
                }
                return value;
            });
            var global_objs = {
                Array: Array,
                Math: Math,
                Number: Number,
                String: String,
            };
            function convert_to_predicate(obj) {
                for (var key in obj) {
                    obj[key] = makePredicate(obj[key]);
                }
            }
            var static_values = {
                Math: [
                    "E",
                    "LN10",
                    "LN2",
                    "LOG2E",
                    "LOG10E",
                    "PI",
                    "SQRT1_2",
                    "SQRT2",
                ],
                Number: [
                    "MAX_VALUE",
                    "MIN_VALUE",
                    "NaN",
                    "NEGATIVE_INFINITY",
                    "POSITIVE_INFINITY",
                ],
            };
            convert_to_predicate(static_values);
            def(AST_PropAccess, function(compressor, depth) {
                if (compressor.option("unsafe")) {
                    var key = this.property;
                    if (key instanceof AST_Node) {
                        key = key._eval(compressor, depth);
                        if (key === this.property) return this;
                    }
                    var exp = this.expression;
                    var val;
                    if (is_undeclared_ref(exp)) {
                        if (!(static_values[exp.name] || return_false)(key)) return this;
                        val = global_objs[exp.name];
                    } else {
                        val = exp._eval(compressor, depth + 1);
                        if (!val || val === exp || !HOP(val, key)) return this;
                    }
                    return val[key];
                }
                return this;
            });
            var object_fns = [
                "constructor",
                "toString",
                "valueOf",
            ];
            var native_fns = {
                Array: [
                    "indexOf",
                    "join",
                    "lastIndexOf",
                    "slice",
                ].concat(object_fns),
                Boolean: object_fns,
                Number: [
                    "toExponential",
                    "toFixed",
                    "toPrecision",
                ].concat(object_fns),
                RegExp: [
                    "test",
                ].concat(object_fns),
                String: [
                    "charAt",
                    "charCodeAt",
                    "concat",
                    "indexOf",
                    "italics",
                    "lastIndexOf",
                    "match",
                    "replace",
                    "search",
                    "slice",
                    "split",
                    "substr",
                    "substring",
                    "trim",
                ].concat(object_fns),
            };
            convert_to_predicate(native_fns);
            var static_fns = {
                Array: [
                    "isArray",
                ],
                Math: [
                    "abs",
                    "acos",
                    "asin",
                    "atan",
                    "ceil",
                    "cos",
                    "exp",
                    "floor",
                    "log",
                    "round",
                    "sin",
                    "sqrt",
                    "tan",
                    "atan2",
                    "pow",
                    "max",
                    "min"
                ],
                Number: [
                    "isFinite",
                    "isNaN",
                ],
                String: [
                    "fromCharCode",
                ],
            };
            convert_to_predicate(static_fns);
            def(AST_Call, function(compressor, depth) {
                var exp = this.expression;
                if (compressor.option("unsafe") && exp instanceof AST_PropAccess) {
                    var key = exp.property;
                    if (key instanceof AST_Node) {
                        key = key._eval(compressor, depth);
                        if (key === exp.property) return this;
                    }
                    var val;
                    var e = exp.expression;
                    if (is_undeclared_ref(e)) {
                        if (!(static_fns[e.name] || return_false)(key)) return this;
                        val = global_objs[e.name];
                    } else {
                        val = e._eval(compressor, depth + 1);
                        if (val === e || !(val && native_fns[val.constructor.name] || return_false)(key)) return this;
                    }
                    var args = [];
                    for (var i = 0, len = this.args.length; i < len; i++) {
                        var arg = this.args[i];
                        var value = arg._eval(compressor, depth);
                        if (arg === value) return this;
                        args.push(value);
                    }
                    return val[key].apply(val, args);
                }
                return this;
            });
            def(AST_New, return_this);
        })(function(node, func){
            node.DEFMETHOD("_eval", func);
        });

        // method to negate an expression
        (function(def){
            function basic_negation(exp) {
                return make_node(AST_UnaryPrefix, exp, {
                    operator: "!",
                    expression: exp
                });
            }
            function best(orig, alt, first_in_statement) {
                var negated = basic_negation(orig);
                if (first_in_statement) {
                    var stat = make_node(AST_SimpleStatement, alt, {
                        body: alt
                    });
                    return best_of_expression(negated, stat) === stat ? alt : negated;
                }
                return best_of_expression(negated, alt);
            }
            def(AST_Node, function(){
                return basic_negation(this);
            });
            def(AST_Statement, function(){
                throw new Error("Cannot negate a statement");
            });
            def(AST_Function, function(){
                return basic_negation(this);
            });
            def(AST_UnaryPrefix, function(){
                if (this.operator == "!")
                    return this.expression;
                return basic_negation(this);
            });
            def(AST_Sequence, function(compressor){
                var expressions = this.expressions.slice();
                expressions.push(expressions.pop().negate(compressor));
                return make_sequence(this, expressions);
            });
            def(AST_Conditional, function(compressor, first_in_statement){
                var self = this.clone();
                self.consequent = self.consequent.negate(compressor);
                self.alternative = self.alternative.negate(compressor);
                return best(this, self, first_in_statement);
            });
            def(AST_Binary, function(compressor, first_in_statement){
                var self = this.clone(), op = this.operator;
                if (compressor.option("unsafe_comps")) {
                    switch (op) {
                        case "<=" : self.operator = ">"  ; return self;
                        case "<"  : self.operator = ">=" ; return self;
                        case ">=" : self.operator = "<"  ; return self;
                        case ">"  : self.operator = "<=" ; return self;
                    }
                }
                switch (op) {
                    case "==" : self.operator = "!="; return self;
                    case "!=" : self.operator = "=="; return self;
                    case "===": self.operator = "!=="; return self;
                    case "!==": self.operator = "==="; return self;
                    case "&&":
                        self.operator = "||";
                        self.left = self.left.negate(compressor, first_in_statement);
                        self.right = self.right.negate(compressor);
                        return best(this, self, first_in_statement);
                    case "||":
                        self.operator = "&&";
                        self.left = self.left.negate(compressor, first_in_statement);
                        self.right = self.right.negate(compressor);
                        return best(this, self, first_in_statement);
                }
                return basic_negation(this);
            });
        })(function(node, func){
            node.DEFMETHOD("negate", function(compressor, first_in_statement){
                return func.call(this, compressor, first_in_statement);
            });
        });

        var global_pure_fns = makePredicate("Boolean decodeURI decodeURIComponent Date encodeURI encodeURIComponent Error escape EvalError isFinite isNaN Number Object parseFloat parseInt RangeError ReferenceError String SyntaxError TypeError unescape URIError");
        AST_Call.DEFMETHOD("is_expr_pure", function(compressor) {
            if (compressor.option("unsafe")) {
                var expr = this.expression;
                if (is_undeclared_ref(expr) && global_pure_fns(expr.name)) return true;
            }
            return this.pure || !compressor.pure_funcs(this);
        });

        // determine if expression has side effects
        (function(def){
            def(AST_Node, return_true);

            def(AST_EmptyStatement, return_false);
            def(AST_Constant, return_false);
            def(AST_This, return_false);

            function any(list, compressor) {
                for (var i = list.length; --i >= 0;)
                    if (list[i].has_side_effects(compressor))
                        return true;
                return false;
            }

            def(AST_Block, function(compressor){
                return any(this.body, compressor);
            });
            def(AST_Call, function(compressor){
                return !this.is_expr_pure(compressor)
                    || any(this.args, compressor);
            });
            def(AST_Switch, function(compressor){
                return this.expression.has_side_effects(compressor)
                    || any(this.body, compressor);
            });
            def(AST_Case, function(compressor){
                return this.expression.has_side_effects(compressor)
                    || any(this.body, compressor);
            });
            def(AST_Try, function(compressor){
                return any(this.body, compressor)
                    || this.bcatch && this.bcatch.has_side_effects(compressor)
                    || this.bfinally && this.bfinally.has_side_effects(compressor);
            });
            def(AST_If, function(compressor){
                return this.condition.has_side_effects(compressor)
                    || this.body && this.body.has_side_effects(compressor)
                    || this.alternative && this.alternative.has_side_effects(compressor);
            });
            def(AST_LabeledStatement, function(compressor){
                return this.body.has_side_effects(compressor);
            });
            def(AST_SimpleStatement, function(compressor){
                return this.body.has_side_effects(compressor);
            });
            def(AST_Lambda, return_false);
            def(AST_Binary, function(compressor){
                return this.left.has_side_effects(compressor)
                    || this.right.has_side_effects(compressor);
            });
            def(AST_Assign, return_true);
            def(AST_Conditional, function(compressor){
                return this.condition.has_side_effects(compressor)
                    || this.consequent.has_side_effects(compressor)
                    || this.alternative.has_side_effects(compressor);
            });
            def(AST_Unary, function(compressor){
                return unary_side_effects(this.operator)
                    || this.expression.has_side_effects(compressor);
            });
            def(AST_SymbolRef, function(compressor){
                return !this.is_declared(compressor);
            });
            def(AST_SymbolDeclaration, return_false);
            def(AST_Object, function(compressor){
                return any(this.properties, compressor);
            });
            def(AST_ObjectProperty, function(compressor){
                return this.value.has_side_effects(compressor);
            });
            def(AST_Array, function(compressor){
                return any(this.elements, compressor);
            });
            def(AST_Dot, function(compressor){
                return this.expression.may_throw_on_access(compressor)
                    || this.expression.has_side_effects(compressor);
            });
            def(AST_Sub, function(compressor){
                return this.expression.may_throw_on_access(compressor)
                    || this.expression.has_side_effects(compressor)
                    || this.property.has_side_effects(compressor);
            });
            def(AST_Sequence, function(compressor){
                return any(this.expressions, compressor);
            });
            def(AST_Definitions, function(compressor){
                return any(this.definitions, compressor);
            });
            def(AST_VarDef, function(compressor){
                return this.value;
            });
        })(function(node, func){
            node.DEFMETHOD("has_side_effects", func);
        });

        // determine if expression may throw
        (function(def){
            def(AST_Node, return_true);

            def(AST_Constant, return_false);
            def(AST_EmptyStatement, return_false);
            def(AST_Lambda, return_false);
            def(AST_SymbolDeclaration, return_false);
            def(AST_This, return_false);

            function any(list, compressor) {
                for (var i = list.length; --i >= 0;)
                    if (list[i].may_throw(compressor))
                        return true;
                return false;
            }

            def(AST_Array, function(compressor){
                return any(this.elements, compressor);
            });
            def(AST_Assign, function(compressor){
                return this.operator != "=" && this.left.may_throw(compressor)
                    || this.right.may_throw(compressor);
            });
            def(AST_Binary, function(compressor){
                return this.left.may_throw(compressor)
                    || this.right.may_throw(compressor);
            });
            def(AST_Block, function(compressor){
                return any(this.body, compressor);
            });
            def(AST_Call, function(compressor){
                if (any(this.args, compressor)) return true;
                if (this.is_expr_pure(compressor)) return false;
                if (this.expression.may_throw(compressor)) return true;
                return !(this.expression instanceof AST_Lambda)
                    || any(this.expression.body, compressor);
            });
            def(AST_Case, function(compressor){
                return this.expression.may_throw(compressor)
                    || any(this.body, compressor);
            });
            def(AST_Conditional, function(compressor){
                return this.condition.may_throw(compressor)
                    || this.consequent.may_throw(compressor)
                    || this.alternative.may_throw(compressor);
            });
            def(AST_Definitions, function(compressor){
                return any(this.definitions, compressor);
            });
            def(AST_Dot, function(compressor){
                return this.expression.may_throw_on_access(compressor)
                    || this.expression.may_throw(compressor);
            });
            def(AST_If, function(compressor){
                return this.condition.may_throw(compressor)
                    || this.body && this.body.may_throw(compressor)
                    || this.alternative && this.alternative.may_throw(compressor);
            });
            def(AST_LabeledStatement, function(compressor){
                return this.body.may_throw(compressor);
            });
            def(AST_Object, function(compressor){
                return any(this.properties, compressor);
            });
            def(AST_ObjectProperty, function(compressor){
                return this.value.may_throw(compressor);
            });
            def(AST_Sequence, function(compressor){
                return any(this.expressions, compressor);
            });
            def(AST_SimpleStatement, function(compressor){
                return this.body.may_throw(compressor);
            });
            def(AST_Sub, function(compressor){
                return this.expression.may_throw_on_access(compressor)
                    || this.expression.may_throw(compressor)
                    || this.property.may_throw(compressor);
            });
            def(AST_Switch, function(compressor){
                return this.expression.may_throw(compressor)
                    || any(this.body, compressor);
            });
            def(AST_SymbolRef, function(compressor){
                return !this.is_declared(compressor);
            });
            def(AST_Try, function(compressor){
                return any(this.body, compressor)
                    || this.bcatch && this.bcatch.may_throw(compressor)
                    || this.bfinally && this.bfinally.may_throw(compressor);
            });
            def(AST_Unary, function(compressor){
                if (this.operator == "typeof" && this.expression instanceof AST_SymbolRef)
                    return false;
                return this.expression.may_throw(compressor);
            });
            def(AST_VarDef, function(compressor){
                if (!this.value) return false;
                return this.value.may_throw(compressor);
            });
        })(function(node, func){
            node.DEFMETHOD("may_throw", func);
        });

        // determine if expression is constant
        (function(def){
            function all(list) {
                for (var i = list.length; --i >= 0;)
                    if (!list[i].is_constant_expression())
                        return false;
                return true;
            }
            def(AST_Node, return_false);
            def(AST_Constant, return_true);
            def(AST_Lambda, function(scope){
                var self = this;
                var result = true;
                self.walk(new TreeWalker(function(node) {
                    if (!result) return true;
                    if (node instanceof AST_SymbolRef) {
                        if (self.inlined) {
                            result = false;
                            return true;
                        }
                        var def = node.definition();
                        if (member(def, self.enclosed)
                            && !self.variables.has(def.name)) {
                            if (scope) {
                                var scope_def = scope.find_variable(node);
                                if (def.undeclared ? !scope_def : scope_def === def) {
                                    result = "f";
                                    return true;
                                }
                            }
                            result = false;
                        }
                        return true;
                    }
                }));
                return result;
            });
            def(AST_Unary, function(){
                return this.expression.is_constant_expression();
            });
            def(AST_Binary, function(){
                return this.left.is_constant_expression() && this.right.is_constant_expression();
            });
            def(AST_Array, function(){
                return all(this.elements);
            });
            def(AST_Object, function(){
                return all(this.properties);
            });
            def(AST_ObjectProperty, function(){
                return this.value.is_constant_expression();
            });
        })(function(node, func){
            node.DEFMETHOD("is_constant_expression", func);
        });

        // tell me if a statement aborts
        function aborts(thing) {
            return thing && thing.aborts();
        };
        (function(def){
            def(AST_Statement, return_null);
            def(AST_Jump, return_this);
            function block_aborts(){
                var n = this.body.length;
                return n > 0 && aborts(this.body[n - 1]);
            };
            def(AST_BlockStatement, block_aborts);
            def(AST_SwitchBranch, block_aborts);
            def(AST_If, function(){
                return this.alternative && aborts(this.body) && aborts(this.alternative) && this;
            });
        })(function(node, func){
            node.DEFMETHOD("aborts", func);
        });

        /* -----[ optimizers ]----- */

        OPT(AST_Directive, function(self, compressor){
            if (compressor.has_directive(self.value) !== self) {
                return make_node(AST_EmptyStatement, self);
            }
            return self;
        });

        OPT(AST_Debugger, function(self, compressor){
            if (compressor.option("drop_debugger"))
                return make_node(AST_EmptyStatement, self);
            return self;
        });

        OPT(AST_LabeledStatement, function(self, compressor){
            if (self.body instanceof AST_Break
                && compressor.loopcontrol_target(self.body) === self.body) {
                return make_node(AST_EmptyStatement, self);
            }
            return self.label.references.length == 0 ? self.body : self;
        });

        OPT(AST_Block, function(self, compressor){
            tighten_body(self.body, compressor);
            return self;
        });

        OPT(AST_BlockStatement, function(self, compressor){
            tighten_body(self.body, compressor);
            switch (self.body.length) {
                case 1: return self.body[0];
                case 0: return make_node(AST_EmptyStatement, self);
            }
            return self;
        });

        AST_Scope.DEFMETHOD("drop_unused", function(compressor){
            if (!compressor.option("unused")) return;
            if (compressor.has_directive("use asm")) return;
            var self = this;
            if (self.uses_eval || self.uses_with) return;
            var drop_funcs = !(self instanceof AST_Toplevel) || compressor.toplevel.funcs;
            var drop_vars = !(self instanceof AST_Toplevel) || compressor.toplevel.vars;
            var assign_as_unused = /keep_assign/.test(compressor.option("unused")) ? return_false : function(node) {
                if (node instanceof AST_Assign && (node.write_only || node.operator == "=")) {
                    return node.left;
                }
                if (node instanceof AST_Unary && node.write_only) return node.expression;
            };
            var in_use = [];
            var in_use_ids = Object.create(null); // avoid expensive linear scans of in_use
            if (self instanceof AST_Toplevel && compressor.top_retain) {
                self.variables.each(function(def) {
                    if (compressor.top_retain(def) && !(def.id in in_use_ids)) {
                        in_use_ids[def.id] = true;
                        in_use.push(def);
                    }
                });
            }
            var var_defs_by_id = new Dictionary();
            var initializations = new Dictionary();
            // pass 1: find out which symbols are directly used in
            // this scope (not in nested scopes).
            var scope = this;
            var tw = new TreeWalker(function(node, descend){
                if (node === self) return;
                if (node instanceof AST_Defun) {
                    var node_def = node.name.definition();
                    if (!drop_funcs && scope === self) {
                        if (!(node_def.id in in_use_ids)) {
                            in_use_ids[node_def.id] = true;
                            in_use.push(node_def);
                        }
                    }
                    initializations.add(node_def.id, node);
                    return true; // don't go in nested scopes
                }
                if (node instanceof AST_SymbolFunarg && scope === self) {
                    var_defs_by_id.add(node.definition().id, node);
                }
                if (node instanceof AST_Definitions && scope === self) {
                    node.definitions.forEach(function(def){
                        var node_def = def.name.definition();
                        if (def.name instanceof AST_SymbolVar) {
                            var_defs_by_id.add(node_def.id, def);
                        }
                        if (!drop_vars) {
                            if (!(node_def.id in in_use_ids)) {
                                in_use_ids[node_def.id] = true;
                                in_use.push(node_def);
                            }
                        }
                        if (def.value) {
                            initializations.add(node_def.id, def.value);
                            if (def.value.has_side_effects(compressor)) {
                                def.value.walk(tw);
                            }
                        }
                    });
                    return true;
                }
                return scan_ref_scoped(node, descend);
            });
            self.walk(tw);
            // pass 2: for every used symbol we need to walk its
            // initialization code to figure out if it uses other
            // symbols (that may not be in_use).
            tw = new TreeWalker(scan_ref_scoped);
            for (var i = 0; i < in_use.length; i++) {
                var init = initializations.get(in_use[i].id);
                if (init) init.forEach(function(init) {
                    init.walk(tw);
                });
            }
            // pass 3: we should drop declarations not in_use
            var tt = new TreeTransformer(
                function before(node, descend, in_list) {
                    var parent = tt.parent();
                    if (drop_vars) {
                        var sym = assign_as_unused(node);
                        if (sym instanceof AST_SymbolRef
                            && !(sym.definition().id in in_use_ids)) {
                            if (node instanceof AST_Assign) {
                                return maintain_this_binding(parent, node, node.right.transform(tt));
                            }
                            return make_node(AST_Number, node, {
                                value: 0
                            });
                        }
                    }
                    if (scope !== self) return;
                    if (node instanceof AST_Function
                        && node.name
                        && !compressor.option("keep_fnames")) {
                        var def = node.name.definition();
                        // any declarations with same name will overshadow
                        // name of this anonymous function and can therefore
                        // never be used anywhere
                        if (!(def.id in in_use_ids) || def.orig.length > 1)
                            node.name = null;
                    }
                    if (node instanceof AST_Lambda && !(node instanceof AST_Accessor)) {
                        var trim = !compressor.option("keep_fargs");
                        for (var a = node.argnames, i = a.length; --i >= 0;) {
                            var sym = a[i];
                            if (!(sym.definition().id in in_use_ids)) {
                                sym.__unused = true;
                                if (trim) {
                                    a.pop();
                                    compressor[sym.unreferenced() ? "warn" : "info"]("Dropping unused function argument {name} [{file}:{line},{col}]", template(sym));
                                }
                            }
                            else {
                                trim = false;
                            }
                        }
                    }
                    if (drop_funcs && node instanceof AST_Defun && node !== self) {
                        var def = node.name.definition();
                        if (!(def.id in in_use_ids)) {
                            compressor[node.name.unreferenced() ? "warn" : "info"]("Dropping unused function {name} [{file}:{line},{col}]", template(node.name));
                            def.eliminated++;
                            return make_node(AST_EmptyStatement, node);
                        }
                    }
                    if (node instanceof AST_Definitions && !(parent instanceof AST_ForIn && parent.init === node)) {
                        // place uninitialized names at the start
                        var body = [], head = [], tail = [];
                        // for unused names whose initialization has
                        // side effects, we can cascade the init. code
                        // into the next one, or next statement.
                        var side_effects = [];
                        node.definitions.forEach(function(def) {
                            if (def.value) def.value = def.value.transform(tt);
                            var sym = def.name.definition();
                            if (!drop_vars || sym.id in in_use_ids) {
                                if (def.name instanceof AST_SymbolVar) {
                                    var var_defs = var_defs_by_id.get(sym.id);
                                    if (var_defs.length > 1 && (!def.value || sym.orig.indexOf(def.name) > sym.eliminated)) {
                                        compressor.warn("Dropping duplicated definition of variable {name} [{file}:{line},{col}]", template(def.name));
                                        if (def.value) {
                                            side_effects.push(make_node(AST_Assign, def, {
                                                operator: "=",
                                                left: make_node(AST_SymbolRef, def.name, def.name),
                                                right: def.value
                                            }));
                                        }
                                        remove(var_defs, def);
                                        sym.eliminated++;
                                        return;
                                    }
                                }
                                if (def.value) {
                                    if (side_effects.length > 0) {
                                        if (tail.length > 0) {
                                            side_effects.push(def.value);
                                            def.value = make_sequence(def.value, side_effects);
                                        } else {
                                            body.push(make_node(AST_SimpleStatement, node, {
                                                body: make_sequence(node, side_effects)
                                            }));
                                        }
                                        side_effects = [];
                                    }
                                    tail.push(def);
                                } else {
                                    head.push(def);
                                }
                            } else if (sym.orig[0] instanceof AST_SymbolCatch) {
                                var value = def.value && def.value.drop_side_effect_free(compressor);
                                if (value) side_effects.push(value);
                                def.value = null;
                                head.push(def);
                            } else {
                                var value = def.value && def.value.drop_side_effect_free(compressor);
                                if (value) {
                                    compressor.warn("Side effects in initialization of unused variable {name} [{file}:{line},{col}]", template(def.name));
                                    side_effects.push(value);
                                } else {
                                    compressor[def.name.unreferenced() ? "warn" : "info"]("Dropping unused variable {name} [{file}:{line},{col}]", template(def.name));
                                }
                                sym.eliminated++;
                            }
                        });
                        if (head.length > 0 || tail.length > 0) {
                            node.definitions = head.concat(tail);
                            body.push(node);
                        }
                        if (side_effects.length > 0) {
                            body.push(make_node(AST_SimpleStatement, node, {
                                body: make_sequence(node, side_effects)
                            }));
                        }
                        switch (body.length) {
                            case 0:
                                return in_list ? MAP.skip : make_node(AST_EmptyStatement, node);
                            case 1:
                                return body[0];
                            default:
                                return in_list ? MAP.splice(body) : make_node(AST_BlockStatement, node, {
                                    body: body
                                });
                        }
                    }
                    // certain combination of unused name + side effect leads to:
                    //    https://github.com/mishoo/UglifyJS2/issues/44
                    //    https://github.com/mishoo/UglifyJS2/issues/1830
                    //    https://github.com/mishoo/UglifyJS2/issues/1838
                    // that's an invalid AST.
                    // We fix it at this stage by moving the `var` outside the `for`.
                    if (node instanceof AST_For) {
                        descend(node, this);
                        var block;
                        if (node.init instanceof AST_BlockStatement) {
                            block = node.init;
                            node.init = block.body.pop();
                            block.body.push(node);
                        }
                        if (node.init instanceof AST_SimpleStatement) {
                            node.init = node.init.body;
                        } else if (is_empty(node.init)) {
                            node.init = null;
                        }
                        return !block ? node : in_list ? MAP.splice(block.body) : block;
                    }
                    if (node instanceof AST_LabeledStatement && node.body instanceof AST_For) {
                        descend(node, this);
                        if (node.body instanceof AST_BlockStatement) {
                            var block = node.body;
                            node.body = block.body.pop();
                            block.body.push(node);
                            return in_list ? MAP.splice(block.body) : block;
                        }
                        return node;
                    }
                    if (node instanceof AST_Scope) {
                        var save_scope = scope;
                        scope = node;
                        descend(node, this);
                        scope = save_scope;
                        return node;
                    }

                    function template(sym) {
                        return {
                            name : sym.name,
                            file : sym.start.file,
                            line : sym.start.line,
                            col  : sym.start.col
                        };
                    }
                }
            );
            self.transform(tt);

            function scan_ref_scoped(node, descend) {
                var sym;
                if ((sym = assign_as_unused(node)) instanceof AST_SymbolRef
                    && self.variables.get(sym.name) === sym.definition()) {
                    if (node instanceof AST_Assign) node.right.walk(tw);
                    return true;
                }
                if (node instanceof AST_SymbolRef) {
                    var node_def = node.definition();
                    if (!(node_def.id in in_use_ids)) {
                        in_use_ids[node_def.id] = true;
                        in_use.push(node_def);
                    }
                    return true;
                }
                if (node instanceof AST_Scope) {
                    var save_scope = scope;
                    scope = node;
                    descend();
                    scope = save_scope;
                    return true;
                }
            }
        });

        AST_Scope.DEFMETHOD("hoist_declarations", function(compressor){
            var self = this;
            if (compressor.has_directive("use asm")) return self;
            var hoist_funs = compressor.option("hoist_funs");
            var hoist_vars = compressor.option("hoist_vars");
            if (hoist_funs || hoist_vars) {
                var dirs = [];
                var hoisted = [];
                var vars = new Dictionary(), vars_found = 0, var_decl = 0;
                // let's count var_decl first, we seem to waste a lot of
                // space if we hoist `var` when there's only one.
                self.walk(new TreeWalker(function(node){
                    if (node instanceof AST_Scope && node !== self)
                        return true;
                    if (node instanceof AST_Var) {
                        ++var_decl;
                        return true;
                    }
                }));
                hoist_vars = hoist_vars && var_decl > 1;
                var tt = new TreeTransformer(
                    function before(node) {
                        if (node !== self) {
                            if (node instanceof AST_Directive) {
                                dirs.push(node);
                                return make_node(AST_EmptyStatement, node);
                            }
                            if (hoist_funs && node instanceof AST_Defun
                                && (tt.parent() === self || !compressor.has_directive("use strict"))) {
                                hoisted.push(node);
                                return make_node(AST_EmptyStatement, node);
                            }
                            if (hoist_vars && node instanceof AST_Var) {
                                node.definitions.forEach(function(def){
                                    vars.set(def.name.name, def);
                                    ++vars_found;
                                });
                                var seq = node.to_assignments(compressor);
                                var p = tt.parent();
                                if (p instanceof AST_ForIn && p.init === node) {
                                    if (seq == null) {
                                        var def = node.definitions[0].name;
                                        return make_node(AST_SymbolRef, def, def);
                                    }
                                    return seq;
                                }
                                if (p instanceof AST_For && p.init === node) {
                                    return seq;
                                }
                                if (!seq) return make_node(AST_EmptyStatement, node);
                                return make_node(AST_SimpleStatement, node, {
                                    body: seq
                                });
                            }
                            if (node instanceof AST_Scope)
                                return node; // to avoid descending in nested scopes
                        }
                    }
                );
                self = self.transform(tt);
                if (vars_found > 0) {
                    // collect only vars which don't show up in self's arguments list
                    var defs = [];
                    vars.each(function(def, name){
                        if (self instanceof AST_Lambda
                            && find_if(function(x){ return x.name == def.name.name },
                                self.argnames)) {
                            vars.del(name);
                        } else {
                            def = def.clone();
                            def.value = null;
                            defs.push(def);
                            vars.set(name, def);
                        }
                    });
                    if (defs.length > 0) {
                        // try to merge in assignments
                        for (var i = 0; i < self.body.length;) {
                            if (self.body[i] instanceof AST_SimpleStatement) {
                                var expr = self.body[i].body, sym, assign;
                                if (expr instanceof AST_Assign
                                    && expr.operator == "="
                                    && (sym = expr.left) instanceof AST_Symbol
                                    && vars.has(sym.name))
                                {
                                    var def = vars.get(sym.name);
                                    if (def.value) break;
                                    def.value = expr.right;
                                    remove(defs, def);
                                    defs.push(def);
                                    self.body.splice(i, 1);
                                    continue;
                                }
                                if (expr instanceof AST_Sequence
                                    && (assign = expr.expressions[0]) instanceof AST_Assign
                                    && assign.operator == "="
                                    && (sym = assign.left) instanceof AST_Symbol
                                    && vars.has(sym.name))
                                {
                                    var def = vars.get(sym.name);
                                    if (def.value) break;
                                    def.value = assign.right;
                                    remove(defs, def);
                                    defs.push(def);
                                    self.body[i].body = make_sequence(expr, expr.expressions.slice(1));
                                    continue;
                                }
                            }
                            if (self.body[i] instanceof AST_EmptyStatement) {
                                self.body.splice(i, 1);
                                continue;
                            }
                            if (self.body[i] instanceof AST_BlockStatement) {
                                var tmp = [ i, 1 ].concat(self.body[i].body);
                                self.body.splice.apply(self.body, tmp);
                                continue;
                            }
                            break;
                        }
                        defs = make_node(AST_Var, self, {
                            definitions: defs
                        });
                        hoisted.push(defs);
                    };
                }
                self.body = dirs.concat(hoisted, self.body);
            }
            return self;
        });

        AST_Scope.DEFMETHOD("var_names", function() {
            var var_names = this._var_names;
            if (!var_names) {
                this._var_names = var_names = Object.create(null);
                this.enclosed.forEach(function(def) {
                    var_names[def.name] = true;
                });
                this.variables.each(function(def, name) {
                    var_names[name] = true;
                });
            }
            return var_names;
        });

        AST_Scope.DEFMETHOD("make_var_name", function(prefix) {
            var var_names = this.var_names();
            prefix = prefix.replace(/[^a-z_$]+/ig, "_");
            var name = prefix;
            for (var i = 0; var_names[name]; i++) name = prefix + "$" + i;
            var_names[name] = true;
            return name;
        });

        AST_Scope.DEFMETHOD("hoist_properties", function(compressor){
            var self = this;
            if (!compressor.option("hoist_props") || compressor.has_directive("use asm")) return self;
            var top_retain = self instanceof AST_Toplevel && compressor.top_retain || return_false;
            var defs_by_id = Object.create(null);
            return self.transform(new TreeTransformer(function(node, descend) {
                if (node instanceof AST_VarDef) {
                    var sym = node.name, def, value;
                    if (sym.scope === self
                        && (def = sym.definition()).escaped != 1
                        && !def.single_use
                        && !def.direct_access
                        && !top_retain(def)
                        && (value = sym.fixed_value()) === node.value
                        && value instanceof AST_Object) {
                        descend(node, this);
                        var defs = new Dictionary();
                        var assignments = [];
                        value.properties.forEach(function(prop) {
                            assignments.push(make_node(AST_VarDef, node, {
                                name: make_sym(prop.key),
                                value: prop.value
                            }));
                        });
                        defs_by_id[def.id] = defs;
                        return MAP.splice(assignments);
                    }
                }
                if (node instanceof AST_PropAccess && node.expression instanceof AST_SymbolRef) {
                    var defs = defs_by_id[node.expression.definition().id];
                    if (defs) {
                        var key = node.property;
                        if (key instanceof AST_Node) key = key.getValue();
                        var def = defs.get(key);
                        var sym = make_node(AST_SymbolRef, node, {
                            name: def.name,
                            scope: node.expression.scope,
                            thedef: def
                        });
                        sym.reference({});
                        return sym;
                    }
                }

                function make_sym(key) {
                    var new_var = make_node(sym.CTOR, sym, {
                        name: self.make_var_name(sym.name + "_" + key),
                        scope: self
                    });
                    var def = self.def_variable(new_var);
                    defs.set(key, def);
                    self.enclosed.push(def);
                    return new_var;
                }
            }));
        });

        // drop_side_effect_free()
        // remove side-effect-free parts which only affects return value
        (function(def){
            // Drop side-effect-free elements from an array of expressions.
            // Returns an array of expressions with side-effects or null
            // if all elements were dropped. Note: original array may be
            // returned if nothing changed.
            function trim(nodes, compressor, first_in_statement) {
                var len = nodes.length;
                if (!len) return null;
                var ret = [], changed = false;
                for (var i = 0; i < len; i++) {
                    var node = nodes[i].drop_side_effect_free(compressor, first_in_statement);
                    changed |= node !== nodes[i];
                    if (node) {
                        ret.push(node);
                        first_in_statement = false;
                    }
                }
                return changed ? ret.length ? ret : null : nodes;
            }

            def(AST_Node, return_this);
            def(AST_Constant, return_null);
            def(AST_This, return_null);
            def(AST_Call, function(compressor, first_in_statement){
                if (!this.is_expr_pure(compressor)) {
                    if (this.expression instanceof AST_Function
                        && (!this.expression.name || !this.expression.name.definition().references.length)) {
                        var node = this.clone();
                        node.expression.process_expression(false, compressor);
                        return node;
                    }
                    return this;
                }
                if (this.pure) {
                    compressor.warn("Dropping __PURE__ call [{file}:{line},{col}]", this.start);
                }
                var args = trim(this.args, compressor, first_in_statement);
                return args && make_sequence(this, args);
            });
            def(AST_Accessor, return_null);
            def(AST_Function, return_null);
            def(AST_Binary, function(compressor, first_in_statement){
                var right = this.right.drop_side_effect_free(compressor);
                if (!right) return this.left.drop_side_effect_free(compressor, first_in_statement);
                if (lazy_op(this.operator)) {
                    if (right === this.right) return this;
                    var node = this.clone();
                    node.right = right;
                    return node;
                } else {
                    var left = this.left.drop_side_effect_free(compressor, first_in_statement);
                    if (!left) return this.right.drop_side_effect_free(compressor, first_in_statement);
                    return make_sequence(this, [ left, right ]);
                }
            });
            def(AST_Assign, function(compressor){
                var left = this.left;
                if (left.has_side_effects(compressor)) return this;
                this.write_only = true;
                while (left instanceof AST_PropAccess) {
                    left = left.expression;
                }
                if (left instanceof AST_Symbol) return this;
                return this.right.drop_side_effect_free(compressor);
            });
            def(AST_Conditional, function(compressor){
                var consequent = this.consequent.drop_side_effect_free(compressor);
                var alternative = this.alternative.drop_side_effect_free(compressor);
                if (consequent === this.consequent && alternative === this.alternative) return this;
                if (!consequent) return alternative ? make_node(AST_Binary, this, {
                    operator: "||",
                    left: this.condition,
                    right: alternative
                }) : this.condition.drop_side_effect_free(compressor);
                if (!alternative) return make_node(AST_Binary, this, {
                    operator: "&&",
                    left: this.condition,
                    right: consequent
                });
                var node = this.clone();
                node.consequent = consequent;
                node.alternative = alternative;
                return node;
            });
            def(AST_Unary, function(compressor, first_in_statement){
                if (unary_side_effects(this.operator)) {
                    this.write_only = !this.expression.has_side_effects(compressor);
                    return this;
                }
                if (this.operator == "typeof" && this.expression instanceof AST_SymbolRef) return null;
                var expression = this.expression.drop_side_effect_free(compressor, first_in_statement);
                if (first_in_statement && expression && is_iife_call(expression)) {
                    if (expression === this.expression && this.operator == "!") return this;
                    return expression.negate(compressor, first_in_statement);
                }
                return expression;
            });
            def(AST_SymbolRef, function(compressor) {
                return this.is_declared(compressor) ? null : this;
            });
            def(AST_Object, function(compressor, first_in_statement){
                var values = trim(this.properties, compressor, first_in_statement);
                return values && make_sequence(this, values);
            });
            def(AST_ObjectProperty, function(compressor, first_in_statement){
                return this.value.drop_side_effect_free(compressor, first_in_statement);
            });
            def(AST_Array, function(compressor, first_in_statement){
                var values = trim(this.elements, compressor, first_in_statement);
                return values && make_sequence(this, values);
            });
            def(AST_Dot, function(compressor, first_in_statement){
                if (this.expression.may_throw_on_access(compressor)) return this;
                return this.expression.drop_side_effect_free(compressor, first_in_statement);
            });
            def(AST_Sub, function(compressor, first_in_statement){
                if (this.expression.may_throw_on_access(compressor)) return this;
                var expression = this.expression.drop_side_effect_free(compressor, first_in_statement);
                if (!expression) return this.property.drop_side_effect_free(compressor, first_in_statement);
                var property = this.property.drop_side_effect_free(compressor);
                if (!property) return expression;
                return make_sequence(this, [ expression, property ]);
            });
            def(AST_Sequence, function(compressor){
                var last = this.tail_node();
                var expr = last.drop_side_effect_free(compressor);
                if (expr === last) return this;
                var expressions = this.expressions.slice(0, -1);
                if (expr) expressions.push(expr);
                return make_sequence(this, expressions);
            });
        })(function(node, func){
            node.DEFMETHOD("drop_side_effect_free", func);
        });

        OPT(AST_SimpleStatement, function(self, compressor){
            if (compressor.option("side_effects")) {
                var body = self.body;
                var node = body.drop_side_effect_free(compressor, true);
                if (!node) {
                    compressor.warn("Dropping side-effect-free statement [{file}:{line},{col}]", self.start);
                    return make_node(AST_EmptyStatement, self);
                }
                if (node !== body) {
                    return make_node(AST_SimpleStatement, self, { body: node });
                }
            }
            return self;
        });

        OPT(AST_While, function(self, compressor){
            return compressor.option("loops") ? make_node(AST_For, self, self).optimize(compressor) : self;
        });

        OPT(AST_Do, function(self, compressor){
            if (!compressor.option("loops")) return self;
            var cond = self.condition.tail_node().evaluate(compressor);
            if (!(cond instanceof AST_Node)) {
                if (cond) return make_node(AST_For, self, {
                    body: make_node(AST_BlockStatement, self.body, {
                        body: [
                            self.body,
                            make_node(AST_SimpleStatement, self.condition, {
                                body: self.condition
                            })
                        ]
                    })
                }).optimize(compressor);
                var has_loop_control = false;
                var tw = new TreeWalker(function(node) {
                    if (node instanceof AST_Scope || has_loop_control) return true;
                    if (node instanceof AST_LoopControl && tw.loopcontrol_target(node) === self)
                        return has_loop_control = true;
                });
                var parent = compressor.parent();
                (parent instanceof AST_LabeledStatement ? parent : self).walk(tw);
                if (!has_loop_control) return make_node(AST_BlockStatement, self.body, {
                    body: [
                        self.body,
                        make_node(AST_SimpleStatement, self.condition, {
                            body: self.condition
                        })
                    ]
                }).optimize(compressor);
            }
            return self;
        });

        function if_break_in_loop(self, compressor) {
            function drop_it(rest) {
                rest = as_statement_array(rest);
                if (self.body instanceof AST_BlockStatement) {
                    self.body = self.body.clone();
                    self.body.body = rest.concat(self.body.body.slice(1));
                    self.body = self.body.transform(compressor);
                } else {
                    self.body = make_node(AST_BlockStatement, self.body, {
                        body: rest
                    }).transform(compressor);
                }
                if_break_in_loop(self, compressor);
            }
            var first = self.body instanceof AST_BlockStatement ? self.body.body[0] : self.body;
            if (first instanceof AST_If) {
                if (first.body instanceof AST_Break
                    && compressor.loopcontrol_target(first.body) === compressor.self()) {
                    if (self.condition) {
                        self.condition = make_node(AST_Binary, self.condition, {
                            left: self.condition,
                            operator: "&&",
                            right: first.condition.negate(compressor),
                        });
                    } else {
                        self.condition = first.condition.negate(compressor);
                    }
                    drop_it(first.alternative);
                }
                else if (first.alternative instanceof AST_Break
                    && compressor.loopcontrol_target(first.alternative) === compressor.self()) {
                    if (self.condition) {
                        self.condition = make_node(AST_Binary, self.condition, {
                            left: self.condition,
                            operator: "&&",
                            right: first.condition,
                        });
                    } else {
                        self.condition = first.condition;
                    }
                    drop_it(first.body);
                }
            }
        };

        OPT(AST_For, function(self, compressor){
            if (!compressor.option("loops")) return self;
            if (compressor.option("side_effects") && self.init) {
                self.init = self.init.drop_side_effect_free(compressor);
            }
            if (self.condition) {
                var cond = self.condition.evaluate(compressor);
                if (!(cond instanceof AST_Node)) {
                    if (cond) self.condition = null;
                    else if (!compressor.option("dead_code")) {
                        var orig = self.condition;
                        self.condition = make_node_from_constant(cond, self.condition);
                        self.condition = best_of_expression(self.condition.transform(compressor), orig);
                    }
                }
                if (compressor.option("dead_code")) {
                    if (cond instanceof AST_Node) cond = self.condition.tail_node().evaluate(compressor);
                    if (!cond) {
                        var body = [];
                        extract_declarations_from_unreachable_code(compressor, self.body, body);
                        if (self.init instanceof AST_Statement) {
                            body.push(self.init);
                        } else if (self.init) {
                            body.push(make_node(AST_SimpleStatement, self.init, {
                                body: self.init
                            }));
                        }
                        body.push(make_node(AST_SimpleStatement, self.condition, {
                            body: self.condition
                        }));
                        return make_node(AST_BlockStatement, self, { body: body }).optimize(compressor);
                    }
                }
            }
            if_break_in_loop(self, compressor);
            return self;
        });

        OPT(AST_If, function(self, compressor){
            if (is_empty(self.alternative)) self.alternative = null;

            if (!compressor.option("conditionals")) return self;
            // if condition can be statically determined, warn and drop
            // one of the blocks.  note, statically determined implies
            // “has no side effects”; also it doesn't work for cases like
            // `x && true`, though it probably should.
            var cond = self.condition.evaluate(compressor);
            if (!compressor.option("dead_code") && !(cond instanceof AST_Node)) {
                var orig = self.condition;
                self.condition = make_node_from_constant(cond, orig);
                self.condition = best_of_expression(self.condition.transform(compressor), orig);
            }
            if (compressor.option("dead_code")) {
                if (cond instanceof AST_Node) cond = self.condition.tail_node().evaluate(compressor);
                if (!cond) {
                    compressor.warn("Condition always false [{file}:{line},{col}]", self.condition.start);
                    var body = [];
                    extract_declarations_from_unreachable_code(compressor, self.body, body);
                    body.push(make_node(AST_SimpleStatement, self.condition, {
                        body: self.condition
                    }));
                    if (self.alternative) body.push(self.alternative);
                    return make_node(AST_BlockStatement, self, { body: body }).optimize(compressor);
                } else if (!(cond instanceof AST_Node)) {
                    compressor.warn("Condition always true [{file}:{line},{col}]", self.condition.start);
                    var body = [];
                    if (self.alternative) {
                        extract_declarations_from_unreachable_code(compressor, self.alternative, body);
                    }
                    body.push(make_node(AST_SimpleStatement, self.condition, {
                        body: self.condition
                    }));
                    body.push(self.body);
                    return make_node(AST_BlockStatement, self, { body: body }).optimize(compressor);
                }
            }
            var negated = self.condition.negate(compressor);
            var self_condition_length = self.condition.print_to_string().length;
            var negated_length = negated.print_to_string().length;
            var negated_is_best = negated_length < self_condition_length;
            if (self.alternative && negated_is_best) {
                negated_is_best = false; // because we already do the switch here.
                // no need to swap values of self_condition_length and negated_length
                // here because they are only used in an equality comparison later on.
                self.condition = negated;
                var tmp = self.body;
                self.body = self.alternative || make_node(AST_EmptyStatement, self);
                self.alternative = tmp;
            }
            if (is_empty(self.body) && is_empty(self.alternative)) {
                return make_node(AST_SimpleStatement, self.condition, {
                    body: self.condition.clone()
                }).optimize(compressor);
            }
            if (self.body instanceof AST_SimpleStatement
                && self.alternative instanceof AST_SimpleStatement) {
                return make_node(AST_SimpleStatement, self, {
                    body: make_node(AST_Conditional, self, {
                        condition   : self.condition,
                        consequent  : self.body.body,
                        alternative : self.alternative.body
                    })
                }).optimize(compressor);
            }
            if (is_empty(self.alternative) && self.body instanceof AST_SimpleStatement) {
                if (self_condition_length === negated_length && !negated_is_best
                    && self.condition instanceof AST_Binary && self.condition.operator == "||") {
                    // although the code length of self.condition and negated are the same,
                    // negated does not require additional surrounding parentheses.
                    // see https://github.com/mishoo/UglifyJS2/issues/979
                    negated_is_best = true;
                }
                if (negated_is_best) return make_node(AST_SimpleStatement, self, {
                    body: make_node(AST_Binary, self, {
                        operator : "||",
                        left     : negated,
                        right    : self.body.body
                    })
                }).optimize(compressor);
                return make_node(AST_SimpleStatement, self, {
                    body: make_node(AST_Binary, self, {
                        operator : "&&",
                        left     : self.condition,
                        right    : self.body.body
                    })
                }).optimize(compressor);
            }
            if (self.body instanceof AST_EmptyStatement
                && self.alternative instanceof AST_SimpleStatement) {
                return make_node(AST_SimpleStatement, self, {
                    body: make_node(AST_Binary, self, {
                        operator : "||",
                        left     : self.condition,
                        right    : self.alternative.body
                    })
                }).optimize(compressor);
            }
            if (self.body instanceof AST_Exit
                && self.alternative instanceof AST_Exit
                && self.body.TYPE == self.alternative.TYPE) {
                return make_node(self.body.CTOR, self, {
                    value: make_node(AST_Conditional, self, {
                        condition   : self.condition,
                        consequent  : self.body.value || make_node(AST_Undefined, self.body),
                        alternative : self.alternative.value || make_node(AST_Undefined, self.alternative)
                    }).transform(compressor)
                }).optimize(compressor);
            }
            if (self.body instanceof AST_If
                && !self.body.alternative
                && !self.alternative) {
                self = make_node(AST_If, self, {
                    condition: make_node(AST_Binary, self.condition, {
                        operator: "&&",
                        left: self.condition,
                        right: self.body.condition
                    }),
                    body: self.body.body,
                    alternative: null
                });
            }
            if (aborts(self.body)) {
                if (self.alternative) {
                    var alt = self.alternative;
                    self.alternative = null;
                    return make_node(AST_BlockStatement, self, {
                        body: [ self, alt ]
                    }).optimize(compressor);
                }
            }
            if (aborts(self.alternative)) {
                var body = self.body;
                self.body = self.alternative;
                self.condition = negated_is_best ? negated : self.condition.negate(compressor);
                self.alternative = null;
                return make_node(AST_BlockStatement, self, {
                    body: [ self, body ]
                }).optimize(compressor);
            }
            return self;
        });

        OPT(AST_Switch, function(self, compressor){
            if (!compressor.option("switches")) return self;
            var branch;
            var value = self.expression.evaluate(compressor);
            if (!(value instanceof AST_Node)) {
                var orig = self.expression;
                self.expression = make_node_from_constant(value, orig);
                self.expression = best_of_expression(self.expression.transform(compressor), orig);
            }
            if (!compressor.option("dead_code")) return self;
            if (value instanceof AST_Node) {
                value = self.expression.tail_node().evaluate(compressor);
            }
            var decl = [];
            var body = [];
            var default_branch;
            var exact_match;
            for (var i = 0, len = self.body.length; i < len && !exact_match; i++) {
                branch = self.body[i];
                if (branch instanceof AST_Default) {
                    if (!default_branch) {
                        default_branch = branch;
                    } else {
                        eliminate_branch(branch, body[body.length - 1]);
                    }
                } else if (!(value instanceof AST_Node)) {
                    var exp = branch.expression.evaluate(compressor);
                    if (!(exp instanceof AST_Node) && exp !== value) {
                        eliminate_branch(branch, body[body.length - 1]);
                        continue;
                    }
                    if (exp instanceof AST_Node) exp = branch.expression.tail_node().evaluate(compressor);
                    if (exp === value) {
                        exact_match = branch;
                        if (default_branch) {
                            var default_index = body.indexOf(default_branch);
                            body.splice(default_index, 1);
                            eliminate_branch(default_branch, body[default_index - 1]);
                            default_branch = null;
                        }
                    }
                }
                if (aborts(branch)) {
                    var prev = body[body.length - 1];
                    if (aborts(prev) && prev.body.length == branch.body.length
                        && make_node(AST_BlockStatement, prev, prev).equivalent_to(make_node(AST_BlockStatement, branch, branch))) {
                        prev.body = [];
                    }
                }
                body.push(branch);
            }
            while (i < len) eliminate_branch(self.body[i++], body[body.length - 1]);
            if (body.length > 0) {
                body[0].body = decl.concat(body[0].body);
            }
            self.body = body;
            while (branch = body[body.length - 1]) {
                var stat = branch.body[branch.body.length - 1];
                if (stat instanceof AST_Break && compressor.loopcontrol_target(stat) === self)
                    branch.body.pop();
                if (branch.body.length || branch instanceof AST_Case
                    && (default_branch || branch.expression.has_side_effects(compressor))) break;
                if (body.pop() === default_branch) default_branch = null;
            }
            if (body.length == 0) {
                return make_node(AST_BlockStatement, self, {
                    body: decl.concat(make_node(AST_SimpleStatement, self.expression, {
                        body: self.expression
                    }))
                }).optimize(compressor);
            }
            if (body.length == 1 && (body[0] === exact_match || body[0] === default_branch)) {
                var has_break = false;
                var tw = new TreeWalker(function(node) {
                    if (has_break
                        || node instanceof AST_Lambda
                        || node instanceof AST_SimpleStatement) return true;
                    if (node instanceof AST_Break && tw.loopcontrol_target(node) === self)
                        has_break = true;
                });
                self.walk(tw);
                if (!has_break) {
                    var statements = body[0].body.slice();
                    var exp = body[0].expression;
                    if (exp) statements.unshift(make_node(AST_SimpleStatement, exp, {
                        body: exp
                    }));
                    statements.unshift(make_node(AST_SimpleStatement, self.expression, {
                        body:self.expression
                    }));
                    return make_node(AST_BlockStatement, self, {
                        body: statements
                    }).optimize(compressor);
                }
            }
            return self;

            function eliminate_branch(branch, prev) {
                if (prev && !aborts(prev)) {
                    prev.body = prev.body.concat(branch.body);
                } else {
                    extract_declarations_from_unreachable_code(compressor, branch, decl);
                }
            }
        });

        OPT(AST_Try, function(self, compressor){
            tighten_body(self.body, compressor);
            if (self.bcatch && self.bfinally && all(self.bfinally.body, is_empty)) self.bfinally = null;
            if (all(self.body, is_empty)) {
                var body = [];
                if (self.bcatch) extract_declarations_from_unreachable_code(compressor, self.bcatch, body);
                if (self.bfinally) body = body.concat(self.bfinally.body);
                return make_node(AST_BlockStatement, self, {
                    body: body
                }).optimize(compressor);
            }
            return self;
        });

        AST_Definitions.DEFMETHOD("remove_initializers", function(){
            this.definitions.forEach(function(def){ def.value = null });
        });

        AST_Definitions.DEFMETHOD("to_assignments", function(compressor){
            var reduce_vars = compressor.option("reduce_vars");
            var assignments = this.definitions.reduce(function(a, def){
                if (def.value) {
                    var name = make_node(AST_SymbolRef, def.name, def.name);
                    a.push(make_node(AST_Assign, def, {
                        operator : "=",
                        left     : name,
                        right    : def.value
                    }));
                    if (reduce_vars) name.definition().fixed = false;
                }
                def = def.name.definition();
                def.eliminated++;
                def.replaced--;
                return a;
            }, []);
            if (assignments.length == 0) return null;
            return make_sequence(this, assignments);
        });

        OPT(AST_Definitions, function(self, compressor){
            if (self.definitions.length == 0)
                return make_node(AST_EmptyStatement, self);
            return self;
        });

        OPT(AST_Call, function(self, compressor){
            var exp = self.expression;
            var fn = exp;
            if (compressor.option("reduce_vars") && fn instanceof AST_SymbolRef) {
                fn = fn.fixed_value();
            }
            var is_func = fn instanceof AST_Lambda;
            if (compressor.option("unused")
                && is_func
                && !fn.uses_arguments
                && !fn.uses_eval) {
                var pos = 0, last = 0;
                for (var i = 0, len = self.args.length; i < len; i++) {
                    var trim = i >= fn.argnames.length;
                    if (trim || fn.argnames[i].__unused) {
                        var node = self.args[i].drop_side_effect_free(compressor);
                        if (node) {
                            self.args[pos++] = node;
                        } else if (!trim) {
                            self.args[pos++] = make_node(AST_Number, self.args[i], {
                                value: 0
                            });
                            continue;
                        }
                    } else {
                        self.args[pos++] = self.args[i];
                    }
                    last = pos;
                }
                self.args.length = last;
            }
            if (compressor.option("unsafe")) {
                if (is_undeclared_ref(exp)) switch (exp.name) {
                    case "Array":
                        if (self.args.length != 1) {
                            return make_node(AST_Array, self, {
                                elements: self.args
                            }).optimize(compressor);
                        }
                        break;
                    case "Object":
                        if (self.args.length == 0) {
                            return make_node(AST_Object, self, {
                                properties: []
                            });
                        }
                        break;
                    case "String":
                        if (self.args.length == 0) return make_node(AST_String, self, {
                            value: ""
                        });
                        if (self.args.length <= 1) return make_node(AST_Binary, self, {
                            left: self.args[0],
                            operator: "+",
                            right: make_node(AST_String, self, { value: "" })
                        }).optimize(compressor);
                        break;
                    case "Number":
                        if (self.args.length == 0) return make_node(AST_Number, self, {
                            value: 0
                        });
                        if (self.args.length == 1) return make_node(AST_UnaryPrefix, self, {
                            expression: self.args[0],
                            operator: "+"
                        }).optimize(compressor);
                    case "Boolean":
                        if (self.args.length == 0) return make_node(AST_False, self);
                        if (self.args.length == 1) return make_node(AST_UnaryPrefix, self, {
                            expression: make_node(AST_UnaryPrefix, self, {
                                expression: self.args[0],
                                operator: "!"
                            }),
                            operator: "!"
                        }).optimize(compressor);
                        break;
                } else if (exp instanceof AST_Dot) switch(exp.property) {
                    case "toString":
                        if (self.args.length == 0) return make_node(AST_Binary, self, {
                            left: make_node(AST_String, self, { value: "" }),
                            operator: "+",
                            right: exp.expression
                        }).optimize(compressor);
                        break;
                    case "join":
                        if (exp.expression instanceof AST_Array) EXIT: {
                            var separator;
                            if (self.args.length > 0) {
                                separator = self.args[0].evaluate(compressor);
                                if (separator === self.args[0]) break EXIT; // not a constant
                            }
                            var elements = [];
                            var consts = [];
                            exp.expression.elements.forEach(function(el) {
                                var value = el.evaluate(compressor);
                                if (value !== el) {
                                    consts.push(value);
                                } else {
                                    if (consts.length > 0) {
                                        elements.push(make_node(AST_String, self, {
                                            value: consts.join(separator)
                                        }));
                                        consts.length = 0;
                                    }
                                    elements.push(el);
                                }
                            });
                            if (consts.length > 0) {
                                elements.push(make_node(AST_String, self, {
                                    value: consts.join(separator)
                                }));
                            }
                            if (elements.length == 0) return make_node(AST_String, self, { value: "" });
                            if (elements.length == 1) {
                                if (elements[0].is_string(compressor)) {
                                    return elements[0];
                                }
                                return make_node(AST_Binary, elements[0], {
                                    operator : "+",
                                    left     : make_node(AST_String, self, { value: "" }),
                                    right    : elements[0]
                                });
                            }
                            if (separator == "") {
                                var first;
                                if (elements[0].is_string(compressor)
                                    || elements[1].is_string(compressor)) {
                                    first = elements.shift();
                                } else {
                                    first = make_node(AST_String, self, { value: "" });
                                }
                                return elements.reduce(function(prev, el){
                                    return make_node(AST_Binary, el, {
                                        operator : "+",
                                        left     : prev,
                                        right    : el
                                    });
                                }, first).optimize(compressor);
                            }
                            // need this awkward cloning to not affect original element
                            // best_of will decide which one to get through.
                            var node = self.clone();
                            node.expression = node.expression.clone();
                            node.expression.expression = node.expression.expression.clone();
                            node.expression.expression.elements = elements;
                            return best_of(compressor, self, node);
                        }
                        break;
                    case "charAt":
                        if (exp.expression.is_string(compressor)) {
                            var arg = self.args[0];
                            var index = arg ? arg.evaluate(compressor) : 0;
                            if (index !== arg) {
                                return make_node(AST_Sub, exp, {
                                    expression: exp.expression,
                                    property: make_node_from_constant(index | 0, arg || exp)
                                }).optimize(compressor);
                            }
                        }
                        break;
                    case "apply":
                        if (self.args.length == 2 && self.args[1] instanceof AST_Array) {
                            var args = self.args[1].elements.slice();
                            args.unshift(self.args[0]);
                            return make_node(AST_Call, self, {
                                expression: make_node(AST_Dot, exp, {
                                    expression: exp.expression,
                                    property: "call"
                                }),
                                args: args
                            }).optimize(compressor);
                        }
                        break;
                    case "call":
                        var func = exp.expression;
                        if (func instanceof AST_SymbolRef) {
                            func = func.fixed_value();
                        }
                        if (func instanceof AST_Lambda && !func.contains_this()) {
                            return make_sequence(this, [
                                self.args[0],
                                make_node(AST_Call, self, {
                                    expression: exp.expression,
                                    args: self.args.slice(1)
                                })
                            ]).optimize(compressor);
                        }
                        break;
                }
            }
            if (compressor.option("unsafe_Func")
                && is_undeclared_ref(exp)
                && exp.name == "Function") {
                // new Function() => function(){}
                if (self.args.length == 0) return make_node(AST_Function, self, {
                    argnames: [],
                    body: []
                });
                if (all(self.args, function(x) {
                    return x instanceof AST_String;
                })) {
                    // quite a corner-case, but we can handle it:
                    //   https://github.com/mishoo/UglifyJS2/issues/203
                    // if the code argument is a constant, then we can minify it.
                    try {
                        var code = "n(function(" + self.args.slice(0, -1).map(function(arg) {
                            return arg.value;
                        }).join(",") + "){" + self.args[self.args.length - 1].value + "})";
                        var ast = parse(code);
                        var mangle = { ie8: compressor.option("ie8") };
                        ast.figure_out_scope(mangle);
                        var comp = new Compressor(compressor.options);
                        ast = ast.transform(comp);
                        ast.figure_out_scope(mangle);
                        base54.reset();
                        ast.compute_char_frequency(mangle);
                        ast.mangle_names(mangle);
                        var fun;
                        ast.walk(new TreeWalker(function(node) {
                            if (fun) return true;
                            if (node instanceof AST_Lambda) {
                                fun = node;
                                return true;
                            }
                        }));
                        var code = OutputStream();
                        AST_BlockStatement.prototype._codegen.call(fun, fun, code);
                        self.args = [
                            make_node(AST_String, self, {
                                value: fun.argnames.map(function(arg) {
                                    return arg.print_to_string();
                                }).join(",")
                            }),
                            make_node(AST_String, self.args[self.args.length - 1], {
                                value: code.get().replace(/^\{|\}$/g, "")
                            })
                        ];
                        return self;
                    } catch (ex) {
                        if (ex instanceof JS_Parse_Error) {
                            compressor.warn("Error parsing code passed to new Function [{file}:{line},{col}]", self.args[self.args.length - 1].start);
                            compressor.warn(ex.toString());
                        } else {
                            throw ex;
                        }
                    }
                }
            }
            var stat = is_func && fn.body[0];
            if (compressor.option("inline") && stat instanceof AST_Return) {
                var value = stat.value;
                if (!value || value.is_constant_expression()) {
                    var args = self.args.concat(value || make_node(AST_Undefined, self));
                    return make_sequence(self, args).optimize(compressor);
                }
            }
            if (is_func) {
                var def, value, scope, level = -1;
                if (compressor.option("inline")
                    && !fn.uses_arguments
                    && !fn.uses_eval
                    && fn.body.length == 1
                    && (exp === fn ? !fn.name
                        : compressor.option("unused")
                        && (def = exp.definition()).references.length == 1
                        && !recursive_ref(compressor, def)
                        && fn.is_constant_expression(exp.scope))
                    && !self.pure
                    && !fn.contains_this()
                    && can_flatten_args(fn)
                    && (value = flatten_body(stat))) {
                    var expressions = flatten_args(fn);
                    expressions.push(value.clone(true));
                    return make_sequence(self, expressions).optimize(compressor);
                }
                if (compressor.option("side_effects") && all(fn.body, is_empty)) {
                    var args = self.args.concat(make_node(AST_Undefined, self));
                    return make_sequence(self, args).optimize(compressor);
                }
            }
            if (compressor.option("drop_console")) {
                if (exp instanceof AST_PropAccess) {
                    var name = exp.expression;
                    while (name.expression) {
                        name = name.expression;
                    }
                    if (is_undeclared_ref(name) && name.name == "console") {
                        return make_node(AST_Undefined, self).optimize(compressor);
                    }
                }
            }
            if (compressor.option("negate_iife")
                && compressor.parent() instanceof AST_SimpleStatement
                && is_iife_call(self)) {
                return self.negate(compressor, true);
            }
            var ev = self.evaluate(compressor);
            if (ev !== self) {
                ev = make_node_from_constant(ev, self).optimize(compressor);
                return best_of(compressor, ev, self);
            }
            return self;

            function can_flatten_args(fn) {
                var catches = Object.create(null), defs;
                do {
                    scope = compressor.parent(++level);
                    if (scope instanceof AST_Catch) {
                        catches[scope.argname.name] = true;
                    } else if (scope instanceof AST_IterationStatement) {
                        defs = [];
                    } else if (scope instanceof AST_SymbolRef) {
                        if (scope.fixed_value() instanceof AST_Scope) return false;
                    }
                } while (!(scope instanceof AST_Scope));
                var safe_to_inject = compressor.toplevel.vars || !(scope instanceof AST_Toplevel);
                for (var i = 0, len = fn.argnames.length; i < len; i++) {
                    var arg = fn.argnames[i];
                    if (arg.__unused) continue;
                    if (!safe_to_inject
                        || catches[arg.name]
                        || identifier_atom(arg.name)
                        || scope.var_names()[arg.name]) {
                        return false;
                    }
                    if (defs) defs.push(arg.definition());
                }
                return !defs || defs.length == 0 || !is_reachable(stat, defs);
            }

            function flatten_args(fn) {
                var decls = [];
                var expressions = [];
                for (var len = fn.argnames.length, i = len; --i >= 0;) {
                    var name = fn.argnames[i];
                    var value = self.args[i];
                    if (name.__unused) {
                        if (value || expressions.length) {
                            expressions.unshift(value || make_node(AST_Undefined, self));
                        }
                    } else {
                        var def = name.definition();
                        scope.var_names()[name.name] = true;
                        scope.variables.set(name.name, def);
                        scope.enclosed.push(def);
                        var symbol = make_node(AST_SymbolVar, name, name);
                        def.orig.push(symbol);
                        decls.unshift(make_node(AST_VarDef, name, {
                            name: symbol,
                            value: null
                        }));
                        var sym = make_node(AST_SymbolRef, name, name);
                        def.references.push(sym);
                        expressions.unshift(make_node(AST_Assign, self, {
                            operator: "=",
                            left: sym,
                            right: value || make_node(AST_Undefined, self)
                        }));
                    }
                }
                for (i = len, len = self.args.length; i < len; i++) {
                    expressions.push(self.args[i]);
                }
                if (decls.length) {
                    i = scope.body.indexOf(compressor.parent(level - 1)) + 1;
                    scope.body.splice(i, 0, make_node(AST_Var, fn, {
                        definitions: decls
                    }));
                }
                return expressions;
            }

            function flatten_body(stat) {
                if (stat instanceof AST_Return) {
                    return stat.value;
                } else if (stat instanceof AST_SimpleStatement) {
                    return make_node(AST_UnaryPrefix, stat, {
                        operator: "void",
                        expression: stat.body
                    });
                }
            }
        });

        OPT(AST_New, function(self, compressor){
            if (compressor.option("unsafe")) {
                var exp = self.expression;
                if (is_undeclared_ref(exp)) {
                    switch (exp.name) {
                        case "Object":
                        case "RegExp":
                        case "Function":
                        case "Error":
                        case "Array":
                            return make_node(AST_Call, self, self).transform(compressor);
                    }
                }
            }
            return self;
        });

        OPT(AST_Sequence, function(self, compressor){
            if (!compressor.option("side_effects")) return self;
            var expressions = [];
            filter_for_side_effects();
            var end = expressions.length - 1;
            trim_right_for_undefined();
            if (end == 0) {
                self = maintain_this_binding(compressor.parent(), compressor.self(), expressions[0]);
                if (!(self instanceof AST_Sequence)) self = self.optimize(compressor);
                return self;
            }
            self.expressions = expressions;
            return self;

            function filter_for_side_effects() {
                var first = first_in_statement(compressor);
                var last = self.expressions.length - 1;
                self.expressions.forEach(function(expr, index) {
                    if (index < last) expr = expr.drop_side_effect_free(compressor, first);
                    if (expr) {
                        merge_sequence(expressions, expr);
                        first = false;
                    }
                });
            }

            function trim_right_for_undefined() {
                while (end > 0 && is_undefined(expressions[end], compressor)) end--;
                if (end < expressions.length - 1) {
                    expressions[end] = make_node(AST_UnaryPrefix, self, {
                        operator   : "void",
                        expression : expressions[end]
                    });
                    expressions.length = end + 1;
                }
            }
        });

        AST_Unary.DEFMETHOD("lift_sequences", function(compressor){
            if (compressor.option("sequences")) {
                if (this.expression instanceof AST_Sequence) {
                    var x = this.expression.expressions.slice();
                    var e = this.clone();
                    e.expression = x.pop();
                    x.push(e);
                    return make_sequence(this, x).optimize(compressor);
                }
            }
            return this;
        });

        OPT(AST_UnaryPostfix, function(self, compressor){
            return self.lift_sequences(compressor);
        });

        OPT(AST_UnaryPrefix, function(self, compressor){
            var e = self.expression;
            if (self.operator == "delete"
                && !(e instanceof AST_SymbolRef
                    || e instanceof AST_PropAccess
                    || is_identifier_atom(e))) {
                if (e instanceof AST_Sequence) {
                    e = e.expressions.slice();
                    e.push(make_node(AST_True, self));
                    return make_sequence(self, e).optimize(compressor);
                }
                return make_sequence(self, [ e, make_node(AST_True, self) ]).optimize(compressor);
            }
            var seq = self.lift_sequences(compressor);
            if (seq !== self) {
                return seq;
            }
            if (compressor.option("side_effects") && self.operator == "void") {
                e = e.drop_side_effect_free(compressor);
                if (e) {
                    self.expression = e;
                    return self;
                } else {
                    return make_node(AST_Undefined, self).optimize(compressor);
                }
            }
            if (compressor.in_boolean_context()) {
                switch (self.operator) {
                    case "!":
                        if (e instanceof AST_UnaryPrefix && e.operator == "!") {
                            // !!foo ==> foo, if we're in boolean context
                            return e.expression;
                        }
                        if (e instanceof AST_Binary) {
                            self = best_of(compressor, self, e.negate(compressor, first_in_statement(compressor)));
                        }
                        break;
                    case "typeof":
                        // typeof always returns a non-empty string, thus it's
                        // always true in booleans
                        compressor.warn("Boolean expression always true [{file}:{line},{col}]", self.start);
                        return (e instanceof AST_SymbolRef ? make_node(AST_True, self) : make_sequence(self, [
                            e,
                            make_node(AST_True, self)
                        ])).optimize(compressor);
                }
            }
            if (self.operator == "-" && e instanceof AST_Infinity) {
                e = e.transform(compressor);
            }
            if (e instanceof AST_Binary
                && (self.operator == "+" || self.operator == "-")
                && (e.operator == "*" || e.operator == "/" || e.operator == "%")) {
                return make_node(AST_Binary, self, {
                    operator: e.operator,
                    left: make_node(AST_UnaryPrefix, e.left, {
                        operator: self.operator,
                        expression: e.left
                    }),
                    right: e.right
                });
            }
            // avoids infinite recursion of numerals
            if (self.operator != "-"
                || !(e instanceof AST_Number || e instanceof AST_Infinity)) {
                var ev = self.evaluate(compressor);
                if (ev !== self) {
                    ev = make_node_from_constant(ev, self).optimize(compressor);
                    return best_of(compressor, ev, self);
                }
            }
            return self;
        });

        AST_Binary.DEFMETHOD("lift_sequences", function(compressor){
            if (compressor.option("sequences")) {
                if (this.left instanceof AST_Sequence) {
                    var x = this.left.expressions.slice();
                    var e = this.clone();
                    e.left = x.pop();
                    x.push(e);
                    return make_sequence(this, x).optimize(compressor);
                }
                if (this.right instanceof AST_Sequence && !this.left.has_side_effects(compressor)) {
                    var assign = this.operator == "=" && this.left instanceof AST_SymbolRef;
                    var x = this.right.expressions;
                    var last = x.length - 1;
                    for (var i = 0; i < last; i++) {
                        if (!assign && x[i].has_side_effects(compressor)) break;
                    }
                    if (i == last) {
                        x = x.slice();
                        var e = this.clone();
                        e.right = x.pop();
                        x.push(e);
                        return make_sequence(this, x).optimize(compressor);
                    } else if (i > 0) {
                        var e = this.clone();
                        e.right = make_sequence(this.right, x.slice(i));
                        x = x.slice(0, i);
                        x.push(e);
                        return make_sequence(this, x).optimize(compressor);
                    }
                }
            }
            return this;
        });

        var commutativeOperators = makePredicate("== === != !== * & | ^");
        function is_object(node) {
            return node instanceof AST_Array
                || node instanceof AST_Lambda
                || node instanceof AST_Object;
        }

        OPT(AST_Binary, function(self, compressor){
            function reversible() {
                return self.left.is_constant()
                    || self.right.is_constant()
                    || !self.left.has_side_effects(compressor)
                    && !self.right.has_side_effects(compressor);
            }
            function reverse(op) {
                if (reversible()) {
                    if (op) self.operator = op;
                    var tmp = self.left;
                    self.left = self.right;
                    self.right = tmp;
                }
            }
            if (commutativeOperators(self.operator)) {
                if (self.right.is_constant()
                    && !self.left.is_constant()) {
                    // if right is a constant, whatever side effects the
                    // left side might have could not influence the
                    // result.  hence, force switch.

                    if (!(self.left instanceof AST_Binary
                        && PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
                        reverse();
                    }
                }
            }
            self = self.lift_sequences(compressor);
            if (compressor.option("comparisons")) switch (self.operator) {
                case "===":
                case "!==":
                    if ((self.left.is_string(compressor) && self.right.is_string(compressor)) ||
                        (self.left.is_number(compressor) && self.right.is_number(compressor)) ||
                        (self.left.is_boolean() && self.right.is_boolean()) ||
                        self.left.equivalent_to(self.right)) {
                        self.operator = self.operator.substr(0, 2);
                    }
                // XXX: intentionally falling down to the next case
                case "==":
                case "!=":
                    // "undefined" == typeof x => undefined === x
                    if (compressor.option("typeofs")
                        && self.left instanceof AST_String
                        && self.left.value == "undefined"
                        && self.right instanceof AST_UnaryPrefix
                        && self.right.operator == "typeof") {
                        var expr = self.right.expression;
                        if (expr instanceof AST_SymbolRef ? expr.is_declared(compressor)
                            : !(expr instanceof AST_PropAccess && compressor.option("ie8"))) {
                            self.right = expr;
                            self.left = make_node(AST_Undefined, self.left).optimize(compressor);
                            if (self.operator.length == 2) self.operator += "=";
                        }
                    }
                    // obj !== obj => false
                    else if (self.left instanceof AST_SymbolRef
                        && self.right instanceof AST_SymbolRef
                        && self.left.definition() === self.right.definition()
                        && is_object(self.left.fixed_value())) {
                        return make_node(self.operator[0] == "=" ? AST_True : AST_False, self);
                    }
                    break;
            }
            if (self.operator == "+" && compressor.in_boolean_context()) {
                var ll = self.left.evaluate(compressor);
                var rr = self.right.evaluate(compressor);
                if (ll && typeof ll == "string") {
                    compressor.warn("+ in boolean context always true [{file}:{line},{col}]", self.start);
                    return make_sequence(self, [
                        self.right,
                        make_node(AST_True, self)
                    ]).optimize(compressor);
                }
                if (rr && typeof rr == "string") {
                    compressor.warn("+ in boolean context always true [{file}:{line},{col}]", self.start);
                    return make_sequence(self, [
                        self.left,
                        make_node(AST_True, self)
                    ]).optimize(compressor);
                }
            }
            if (compressor.option("comparisons") && self.is_boolean()) {
                if (!(compressor.parent() instanceof AST_Binary)
                    || compressor.parent() instanceof AST_Assign) {
                    var negated = make_node(AST_UnaryPrefix, self, {
                        operator: "!",
                        expression: self.negate(compressor, first_in_statement(compressor))
                    });
                    self = best_of(compressor, self, negated);
                }
                if (compressor.option("unsafe_comps")) {
                    switch (self.operator) {
                        case "<": reverse(">"); break;
                        case "<=": reverse(">="); break;
                    }
                }
            }
            if (self.operator == "+") {
                if (self.right instanceof AST_String
                    && self.right.getValue() == ""
                    && self.left.is_string(compressor)) {
                    return self.left;
                }
                if (self.left instanceof AST_String
                    && self.left.getValue() == ""
                    && self.right.is_string(compressor)) {
                    return self.right;
                }
                if (self.left instanceof AST_Binary
                    && self.left.operator == "+"
                    && self.left.left instanceof AST_String
                    && self.left.left.getValue() == ""
                    && self.right.is_string(compressor)) {
                    self.left = self.left.right;
                    return self.transform(compressor);
                }
            }
            if (compressor.option("evaluate")) {
                switch (self.operator) {
                    case "&&":
                        var ll = self.left.truthy ? true : self.left.falsy ? false : self.left.evaluate(compressor);
                        if (!ll) {
                            compressor.warn("Condition left of && always false [{file}:{line},{col}]", self.start);
                            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor);
                        } else if (!(ll instanceof AST_Node)) {
                            compressor.warn("Condition left of && always true [{file}:{line},{col}]", self.start);
                            return make_sequence(self, [ self.left, self.right ]).optimize(compressor);
                        }
                        var rr = self.right.evaluate(compressor);
                        if (!rr) {
                            if (compressor.in_boolean_context()) {
                                compressor.warn("Boolean && always false [{file}:{line},{col}]", self.start);
                                return make_sequence(self, [
                                    self.left,
                                    make_node(AST_False, self)
                                ]).optimize(compressor);
                            } else self.falsy = true;
                        } else if (!(rr instanceof AST_Node)) {
                            var parent = compressor.parent();
                            if (parent.operator == "&&" && parent.left === compressor.self() || compressor.in_boolean_context()) {
                                compressor.warn("Dropping side-effect-free && [{file}:{line},{col}]", self.start);
                                return self.left.optimize(compressor);
                            }
                        }
                        // x || false && y ---> x ? y : false
                        if (self.left.operator == "||") {
                            var lr = self.left.right.evaluate(compressor);
                            if (!lr) return make_node(AST_Conditional, self, {
                                condition: self.left.left,
                                consequent: self.right,
                                alternative: self.left.right
                            }).optimize(compressor);
                        }
                        break;
                    case "||":
                        var ll = self.left.truthy ? true : self.left.falsy ? false : self.left.evaluate(compressor);
                        if (!ll) {
                            compressor.warn("Condition left of || always false [{file}:{line},{col}]", self.start);
                            return make_sequence(self, [ self.left, self.right ]).optimize(compressor);
                        } else if (!(ll instanceof AST_Node)) {
                            compressor.warn("Condition left of || always true [{file}:{line},{col}]", self.start);
                            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor);
                        }
                        var rr = self.right.evaluate(compressor);
                        if (!rr) {
                            var parent = compressor.parent();
                            if (parent.operator == "||" && parent.left === compressor.self() || compressor.in_boolean_context()) {
                                compressor.warn("Dropping side-effect-free || [{file}:{line},{col}]", self.start);
                                return self.left.optimize(compressor);
                            }
                        } else if (!(rr instanceof AST_Node)) {
                            if (compressor.in_boolean_context()) {
                                compressor.warn("Boolean || always true [{file}:{line},{col}]", self.start);
                                return make_sequence(self, [
                                    self.left,
                                    make_node(AST_True, self)
                                ]).optimize(compressor);
                            } else self.truthy = true;
                        }
                        if (self.left.operator == "&&") {
                            var lr = self.left.right.evaluate(compressor);
                            if (lr && !(lr instanceof AST_Node)) return make_node(AST_Conditional, self, {
                                condition: self.left.left,
                                consequent: self.left.right,
                                alternative: self.right
                            }).optimize(compressor);
                        }
                        break;
                }
                var associative = true;
                switch (self.operator) {
                    case "+":
                        // "foo" + ("bar" + x) => "foobar" + x
                        if (self.left instanceof AST_Constant
                            && self.right instanceof AST_Binary
                            && self.right.operator == "+"
                            && self.right.left instanceof AST_Constant
                            && self.right.is_string(compressor)) {
                            self = make_node(AST_Binary, self, {
                                operator: "+",
                                left: make_node(AST_String, self.left, {
                                    value: "" + self.left.getValue() + self.right.left.getValue(),
                                    start: self.left.start,
                                    end: self.right.left.end
                                }),
                                right: self.right.right
                            });
                        }
                        // (x + "foo") + "bar" => x + "foobar"
                        if (self.right instanceof AST_Constant
                            && self.left instanceof AST_Binary
                            && self.left.operator == "+"
                            && self.left.right instanceof AST_Constant
                            && self.left.is_string(compressor)) {
                            self = make_node(AST_Binary, self, {
                                operator: "+",
                                left: self.left.left,
                                right: make_node(AST_String, self.right, {
                                    value: "" + self.left.right.getValue() + self.right.getValue(),
                                    start: self.left.right.start,
                                    end: self.right.end
                                })
                            });
                        }
                        // (x + "foo") + ("bar" + y) => (x + "foobar") + y
                        if (self.left instanceof AST_Binary
                            && self.left.operator == "+"
                            && self.left.is_string(compressor)
                            && self.left.right instanceof AST_Constant
                            && self.right instanceof AST_Binary
                            && self.right.operator == "+"
                            && self.right.left instanceof AST_Constant
                            && self.right.is_string(compressor)) {
                            self = make_node(AST_Binary, self, {
                                operator: "+",
                                left: make_node(AST_Binary, self.left, {
                                    operator: "+",
                                    left: self.left.left,
                                    right: make_node(AST_String, self.left.right, {
                                        value: "" + self.left.right.getValue() + self.right.left.getValue(),
                                        start: self.left.right.start,
                                        end: self.right.left.end
                                    })
                                }),
                                right: self.right.right
                            });
                        }
                        // a + -b => a - b
                        if (self.right instanceof AST_UnaryPrefix
                            && self.right.operator == "-"
                            && self.left.is_number(compressor)) {
                            self = make_node(AST_Binary, self, {
                                operator: "-",
                                left: self.left,
                                right: self.right.expression
                            });
                            break;
                        }
                        // -a + b => b - a
                        if (self.left instanceof AST_UnaryPrefix
                            && self.left.operator == "-"
                            && reversible()
                            && self.right.is_number(compressor)) {
                            self = make_node(AST_Binary, self, {
                                operator: "-",
                                left: self.right,
                                right: self.left.expression
                            });
                            break;
                        }
                    case "*":
                        associative = compressor.option("unsafe_math");
                    case "&":
                    case "|":
                    case "^":
                        // a + +b => +b + a
                        if (self.left.is_number(compressor)
                            && self.right.is_number(compressor)
                            && reversible()
                            && !(self.left instanceof AST_Binary
                                && self.left.operator != self.operator
                                && PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
                            var reversed = make_node(AST_Binary, self, {
                                operator: self.operator,
                                left: self.right,
                                right: self.left
                            });
                            if (self.right instanceof AST_Constant
                                && !(self.left instanceof AST_Constant)) {
                                self = best_of(compressor, reversed, self);
                            } else {
                                self = best_of(compressor, self, reversed);
                            }
                        }
                        if (associative && self.is_number(compressor)) {
                            // a + (b + c) => (a + b) + c
                            if (self.right instanceof AST_Binary
                                && self.right.operator == self.operator) {
                                self = make_node(AST_Binary, self, {
                                    operator: self.operator,
                                    left: make_node(AST_Binary, self.left, {
                                        operator: self.operator,
                                        left: self.left,
                                        right: self.right.left,
                                        start: self.left.start,
                                        end: self.right.left.end
                                    }),
                                    right: self.right.right
                                });
                            }
                            // (n + 2) + 3 => 5 + n
                            // (2 * n) * 3 => 6 + n
                            if (self.right instanceof AST_Constant
                                && self.left instanceof AST_Binary
                                && self.left.operator == self.operator) {
                                if (self.left.left instanceof AST_Constant) {
                                    self = make_node(AST_Binary, self, {
                                        operator: self.operator,
                                        left: make_node(AST_Binary, self.left, {
                                            operator: self.operator,
                                            left: self.left.left,
                                            right: self.right,
                                            start: self.left.left.start,
                                            end: self.right.end
                                        }),
                                        right: self.left.right
                                    });
                                } else if (self.left.right instanceof AST_Constant) {
                                    self = make_node(AST_Binary, self, {
                                        operator: self.operator,
                                        left: make_node(AST_Binary, self.left, {
                                            operator: self.operator,
                                            left: self.left.right,
                                            right: self.right,
                                            start: self.left.right.start,
                                            end: self.right.end
                                        }),
                                        right: self.left.left
                                    });
                                }
                            }
                            // (a | 1) | (2 | d) => (3 | a) | b
                            if (self.left instanceof AST_Binary
                                && self.left.operator == self.operator
                                && self.left.right instanceof AST_Constant
                                && self.right instanceof AST_Binary
                                && self.right.operator == self.operator
                                && self.right.left instanceof AST_Constant) {
                                self = make_node(AST_Binary, self, {
                                    operator: self.operator,
                                    left: make_node(AST_Binary, self.left, {
                                        operator: self.operator,
                                        left: make_node(AST_Binary, self.left.left, {
                                            operator: self.operator,
                                            left: self.left.right,
                                            right: self.right.left,
                                            start: self.left.right.start,
                                            end: self.right.left.end
                                        }),
                                        right: self.left.left
                                    }),
                                    right: self.right.right
                                });
                            }
                        }
                }
            }
            // x && (y && z)  ==>  x && y && z
            // x || (y || z)  ==>  x || y || z
            // x + ("y" + z)  ==>  x + "y" + z
            // "x" + (y + "z")==>  "x" + y + "z"
            if (self.right instanceof AST_Binary
                && self.right.operator == self.operator
                && (lazy_op(self.operator)
                    || (self.operator == "+"
                        && (self.right.left.is_string(compressor)
                            || (self.left.is_string(compressor)
                                && self.right.right.is_string(compressor))))))
            {
                self.left = make_node(AST_Binary, self.left, {
                    operator : self.operator,
                    left     : self.left,
                    right    : self.right.left
                });
                self.right = self.right.right;
                return self.transform(compressor);
            }
            var ev = self.evaluate(compressor);
            if (ev !== self) {
                ev = make_node_from_constant(ev, self).optimize(compressor);
                return best_of(compressor, ev, self);
            }
            return self;
        });

        function recursive_ref(compressor, def) {
            var node;
            for (var i = 0; node = compressor.parent(i); i++) {
                if (node instanceof AST_Lambda) {
                    var name = node.name;
                    if (name && name.definition() === def) break;
                }
            }
            return node;
        }

        OPT(AST_SymbolRef, function(self, compressor){
            var def = self.resolve_defines(compressor);
            if (def) {
                return def.optimize(compressor);
            }
            // testing against !self.scope.uses_with first is an optimization
            if (!compressor.option("ie8")
                && is_undeclared_ref(self)
                && (!self.scope.uses_with || !compressor.find_parent(AST_With))) {
                switch (self.name) {
                    case "undefined":
                        return make_node(AST_Undefined, self).optimize(compressor);
                    case "NaN":
                        return make_node(AST_NaN, self).optimize(compressor);
                    case "Infinity":
                        return make_node(AST_Infinity, self).optimize(compressor);
                }
            }
            if (compressor.option("reduce_vars")
                && is_lhs(self, compressor.parent()) !== self) {
                var d = self.definition();
                var fixed = self.fixed_value();
                var single_use = d.single_use;
                if (single_use && fixed instanceof AST_Lambda) {
                    if (d.scope !== self.scope
                        && (!compressor.option("reduce_funcs")
                            || d.escaped == 1
                            || fixed.inlined)) {
                        single_use = false;
                    } else if (recursive_ref(compressor, d)) {
                        single_use = false;
                    } else if (d.scope !== self.scope || d.orig[0] instanceof AST_SymbolFunarg) {
                        single_use = fixed.is_constant_expression(self.scope);
                        if (single_use == "f") {
                            var scope = self.scope;
                            do {
                                if (scope instanceof AST_Defun || scope instanceof AST_Function) {
                                    scope.inlined = true;
                                }
                            } while (scope = scope.parent_scope);
                        }
                    }
                }
                if (single_use && fixed) {
                    if (fixed instanceof AST_Defun) {
                        fixed = make_node(AST_Function, fixed, fixed);
                    }
                    var value;
                    if (d.recursive_refs > 0 && fixed.name instanceof AST_SymbolDefun) {
                        value = fixed.clone(true);
                        var defun_def = value.name.definition();
                        var lambda_def = value.variables.get(value.name.name);
                        var name = lambda_def && lambda_def.orig[0];
                        if (!(name instanceof AST_SymbolLambda)) {
                            name = make_node(AST_SymbolLambda, value.name, value.name);
                            name.scope = value;
                            value.name = name;
                            lambda_def = value.def_function(name);
                        }
                        value.walk(new TreeWalker(function(node) {
                            if (node instanceof AST_SymbolRef && node.definition() === defun_def) {
                                node.thedef = lambda_def;
                                lambda_def.references.push(node);
                            }
                        }));
                    } else {
                        value = fixed.optimize(compressor);
                        if (value === fixed) value = fixed.clone(true);
                    }
                    return value;
                }
                if (fixed && d.should_replace === undefined) {
                    var init;
                    if (fixed instanceof AST_This) {
                        if (!(d.orig[0] instanceof AST_SymbolFunarg)
                            && all(d.references, function(ref) {
                                return d.scope === ref.scope;
                            })) {
                            init = fixed;
                        }
                    } else {
                        var ev = fixed.evaluate(compressor);
                        if (ev !== fixed && (compressor.option("unsafe_regexp") || !(ev instanceof RegExp))) {
                            init = make_node_from_constant(ev, fixed);
                        }
                    }
                    if (init) {
                        var value_length = init.optimize(compressor).print_to_string().length;
                        var fn;
                        if (has_symbol_ref(fixed)) {
                            fn = function() {
                                var result = init.optimize(compressor);
                                return result === init ? result.clone(true) : result;
                            };
                        } else {
                            value_length = Math.min(value_length, fixed.print_to_string().length);
                            fn = function() {
                                var result = best_of_expression(init.optimize(compressor), fixed);
                                return result === init || result === fixed ? result.clone(true) : result;
                            };
                        }
                        var name_length = d.name.length;
                        var overhead = 0;
                        if (compressor.option("unused") && !compressor.exposed(d)) {
                            overhead = (name_length + 2 + value_length) / d.references.length;
                        }
                        d.should_replace = value_length <= name_length + overhead ? fn : false;
                    } else {
                        d.should_replace = false;
                    }
                }
                if (d.should_replace) {
                    return d.should_replace();
                }
            }
            return self;

            function has_symbol_ref(value) {
                var found;
                value.walk(new TreeWalker(function(node) {
                    if (node instanceof AST_SymbolRef) found = true;
                    if (found) return true;
                }));
                return found;
            }
        });

        function is_atomic(lhs, self) {
            return lhs instanceof AST_SymbolRef || lhs.TYPE === self.TYPE;
        }

        OPT(AST_Undefined, function(self, compressor){
            if (compressor.option("unsafe")) {
                var undef = find_variable(compressor, "undefined");
                if (undef) {
                    var ref = make_node(AST_SymbolRef, self, {
                        name   : "undefined",
                        scope  : undef.scope,
                        thedef : undef
                    });
                    ref.is_undefined = true;
                    return ref;
                }
            }
            var lhs = is_lhs(compressor.self(), compressor.parent());
            if (lhs && is_atomic(lhs, self)) return self;
            return make_node(AST_UnaryPrefix, self, {
                operator: "void",
                expression: make_node(AST_Number, self, {
                    value: 0
                })
            });
        });

        OPT(AST_Infinity, function(self, compressor){
            var lhs = is_lhs(compressor.self(), compressor.parent());
            if (lhs && is_atomic(lhs, self)) return self;
            if (compressor.option("keep_infinity")
                && !(lhs && !is_atomic(lhs, self))
                && !find_variable(compressor, "Infinity"))
                return self;
            return make_node(AST_Binary, self, {
                operator: "/",
                left: make_node(AST_Number, self, {
                    value: 1
                }),
                right: make_node(AST_Number, self, {
                    value: 0
                })
            });
        });

        OPT(AST_NaN, function(self, compressor){
            var lhs = is_lhs(compressor.self(), compressor.parent());
            if (lhs && !is_atomic(lhs, self)
                || find_variable(compressor, "NaN")) {
                return make_node(AST_Binary, self, {
                    operator: "/",
                    left: make_node(AST_Number, self, {
                        value: 0
                    }),
                    right: make_node(AST_Number, self, {
                        value: 0
                    })
                });
            }
            return self;
        });

        function is_reachable(self, defs) {
            var reachable = false;
            var find_ref = new TreeWalker(function(node) {
                if (reachable) return true;
                if (node instanceof AST_SymbolRef && member(node.definition(), defs)) {
                    return reachable = true;
                }
            });
            var scan_scope = new TreeWalker(function(node) {
                if (reachable) return true;
                if (node instanceof AST_Scope && node !== self) {
                    var parent = scan_scope.parent();
                    if (!(parent instanceof AST_Call && parent.expression === node)) {
                        node.walk(find_ref);
                    }
                    return true;
                }
            });
            self.walk(scan_scope);
            return reachable;
        }

        var ASSIGN_OPS = [ '+', '-', '/', '*', '%', '>>', '<<', '>>>', '|', '^', '&' ];
        var ASSIGN_OPS_COMMUTATIVE = [ '*', '|', '^', '&' ];
        OPT(AST_Assign, function(self, compressor){
            var def;
            if (compressor.option("dead_code")
                && self.left instanceof AST_SymbolRef
                && (def = self.left.definition()).scope === compressor.find_parent(AST_Lambda)) {
                var level = 0, node, parent = self;
                do {
                    node = parent;
                    parent = compressor.parent(level++);
                    if (parent instanceof AST_Exit) {
                        if (in_try(level, parent instanceof AST_Throw)) break;
                        if (is_reachable(def.scope, [ def ])) break;
                        if (self.operator == "=") return self.right;
                        return make_node(AST_Binary, self, {
                            operator: self.operator.slice(0, -1),
                            left: self.left,
                            right: self.right
                        }).optimize(compressor);
                    }
                } while (parent instanceof AST_Binary && parent.right === node
                || parent instanceof AST_Sequence && parent.tail_node() === node);
            }
            self = self.lift_sequences(compressor);
            if (self.operator == "=" && self.left instanceof AST_SymbolRef && self.right instanceof AST_Binary) {
                // x = expr1 OP expr2
                if (self.right.left instanceof AST_SymbolRef
                    && self.right.left.name == self.left.name
                    && member(self.right.operator, ASSIGN_OPS)) {
                    // x = x - 2  --->  x -= 2
                    self.operator = self.right.operator + "=";
                    self.right = self.right.right;
                }
                else if (self.right.right instanceof AST_SymbolRef
                    && self.right.right.name == self.left.name
                    && member(self.right.operator, ASSIGN_OPS_COMMUTATIVE)
                    && !self.right.left.has_side_effects(compressor)) {
                    // x = 2 & x  --->  x &= 2
                    self.operator = self.right.operator + "=";
                    self.right = self.right.left;
                }
            }
            return self;

            function in_try(level, no_catch) {
                var scope = self.left.definition().scope;
                var parent;
                while ((parent = compressor.parent(level++)) !== scope) {
                    if (parent instanceof AST_Try) {
                        if (parent.bfinally) return true;
                        if (no_catch && parent.bcatch) return true;
                    }
                }
            }
        });

        OPT(AST_Conditional, function(self, compressor){
            if (!compressor.option("conditionals")) return self;
            // This looks like lift_sequences(), should probably be under "sequences"
            if (self.condition instanceof AST_Sequence) {
                var expressions = self.condition.expressions.slice();
                self.condition = expressions.pop();
                expressions.push(self);
                return make_sequence(self, expressions);
            }
            var cond = self.condition.evaluate(compressor);
            if (cond !== self.condition) {
                if (cond) {
                    compressor.warn("Condition always true [{file}:{line},{col}]", self.start);
                    return maintain_this_binding(compressor.parent(), compressor.self(), self.consequent);
                } else {
                    compressor.warn("Condition always false [{file}:{line},{col}]", self.start);
                    return maintain_this_binding(compressor.parent(), compressor.self(), self.alternative);
                }
            }
            var negated = cond.negate(compressor, first_in_statement(compressor));
            if (best_of(compressor, cond, negated) === negated) {
                self = make_node(AST_Conditional, self, {
                    condition: negated,
                    consequent: self.alternative,
                    alternative: self.consequent
                });
            }
            var condition = self.condition;
            var consequent = self.consequent;
            var alternative = self.alternative;
            // x?x:y --> x||y
            if (condition instanceof AST_SymbolRef
                && consequent instanceof AST_SymbolRef
                && condition.definition() === consequent.definition()) {
                return make_node(AST_Binary, self, {
                    operator: "||",
                    left: condition,
                    right: alternative
                });
            }
            // if (foo) exp = something; else exp = something_else;
            //                   |
            //                   v
            // exp = foo ? something : something_else;
            if (consequent instanceof AST_Assign
                && alternative instanceof AST_Assign
                && consequent.operator == alternative.operator
                && consequent.left.equivalent_to(alternative.left)
                && (!self.condition.has_side_effects(compressor)
                    || consequent.operator == "="
                    && !consequent.left.has_side_effects(compressor))) {
                return make_node(AST_Assign, self, {
                    operator: consequent.operator,
                    left: consequent.left,
                    right: make_node(AST_Conditional, self, {
                        condition: self.condition,
                        consequent: consequent.right,
                        alternative: alternative.right
                    })
                });
            }
            // x ? y(a) : y(b) --> y(x ? a : b)
            var arg_index;
            if (consequent instanceof AST_Call
                && alternative.TYPE === consequent.TYPE
                && consequent.args.length > 0
                && consequent.args.length == alternative.args.length
                && consequent.expression.equivalent_to(alternative.expression)
                && !self.condition.has_side_effects(compressor)
                && !consequent.expression.has_side_effects(compressor)
                && typeof (arg_index = single_arg_diff()) == "number") {
                var node = consequent.clone();
                node.args[arg_index] = make_node(AST_Conditional, self, {
                    condition: self.condition,
                    consequent: consequent.args[arg_index],
                    alternative: alternative.args[arg_index]
                });
                return node;
            }
            // x?y?z:a:a --> x&&y?z:a
            if (consequent instanceof AST_Conditional
                && consequent.alternative.equivalent_to(alternative)) {
                return make_node(AST_Conditional, self, {
                    condition: make_node(AST_Binary, self, {
                        left: self.condition,
                        operator: "&&",
                        right: consequent.condition
                    }),
                    consequent: consequent.consequent,
                    alternative: alternative
                });
            }
            // x ? y : y --> x, y
            if (consequent.equivalent_to(alternative)) {
                return make_sequence(self, [
                    self.condition,
                    consequent
                ]).optimize(compressor);
            }
            var in_bool = compressor.in_boolean_context();
            if (is_true(self.consequent)) {
                if (is_false(self.alternative)) {
                    // c ? true : false ---> !!c
                    return booleanize(self.condition);
                }
                // c ? true : x ---> !!c || x
                return make_node(AST_Binary, self, {
                    operator: "||",
                    left: booleanize(self.condition),
                    right: self.alternative
                });
            }
            if (is_false(self.consequent)) {
                if (is_true(self.alternative)) {
                    // c ? false : true ---> !c
                    return booleanize(self.condition.negate(compressor));
                }
                // c ? false : x ---> !c && x
                return make_node(AST_Binary, self, {
                    operator: "&&",
                    left: booleanize(self.condition.negate(compressor)),
                    right: self.alternative
                });
            }
            if (is_true(self.alternative)) {
                // c ? x : true ---> !c || x
                return make_node(AST_Binary, self, {
                    operator: "||",
                    left: booleanize(self.condition.negate(compressor)),
                    right: self.consequent
                });
            }
            if (is_false(self.alternative)) {
                // c ? x : false ---> !!c && x
                return make_node(AST_Binary, self, {
                    operator: "&&",
                    left: booleanize(self.condition),
                    right: self.consequent
                });
            }

            return self;

            function booleanize(node) {
                if (node.is_boolean()) return node;
                // !!expression
                return make_node(AST_UnaryPrefix, node, {
                    operator: "!",
                    expression: node.negate(compressor)
                });
            }

            // AST_True or !0
            function is_true(node) {
                return node instanceof AST_True
                    || in_bool
                    && node instanceof AST_Constant
                    && node.getValue()
                    || (node instanceof AST_UnaryPrefix
                        && node.operator == "!"
                        && node.expression instanceof AST_Constant
                        && !node.expression.getValue());
            }
            // AST_False or !1
            function is_false(node) {
                return node instanceof AST_False
                    || in_bool
                    && node instanceof AST_Constant
                    && !node.getValue()
                    || (node instanceof AST_UnaryPrefix
                        && node.operator == "!"
                        && node.expression instanceof AST_Constant
                        && node.expression.getValue());
            }

            function single_arg_diff() {
                var a = consequent.args;
                var b = alternative.args;
                for (var i = 0, len = a.length; i < len; i++) {
                    if (!a[i].equivalent_to(b[i])) {
                        for (var j = i + 1; j < len; j++) {
                            if (!a[j].equivalent_to(b[j])) return;
                        }
                        return i;
                    }
                }
            }
        });

        OPT(AST_Boolean, function(self, compressor){
            if (compressor.in_boolean_context()) return make_node(AST_Number, self, {
                value: +self.value
            });
            if (compressor.option("booleans")) {
                var p = compressor.parent();
                if (p instanceof AST_Binary && (p.operator == "=="
                    || p.operator == "!=")) {
                    compressor.warn("Non-strict equality against boolean: {operator} {value} [{file}:{line},{col}]", {
                        operator : p.operator,
                        value    : self.value,
                        file     : p.start.file,
                        line     : p.start.line,
                        col      : p.start.col,
                    });
                    return make_node(AST_Number, self, {
                        value: +self.value
                    });
                }
                return make_node(AST_UnaryPrefix, self, {
                    operator: "!",
                    expression: make_node(AST_Number, self, {
                        value: 1 - self.value
                    })
                });
            }
            return self;
        });

        OPT(AST_Sub, function(self, compressor){
            var expr = self.expression;
            var prop = self.property;
            if (compressor.option("properties")) {
                var key = prop.evaluate(compressor);
                if (key !== prop) {
                    if (typeof key == "string") {
                        if (key == "undefined") {
                            key = undefined;
                        } else {
                            var value = parseFloat(key);
                            if (value.toString() == key) {
                                key = value;
                            }
                        }
                    }
                    prop = self.property = best_of_expression(prop, make_node_from_constant(key, prop).transform(compressor));
                    var property = "" + key;
                    if (is_identifier_string(property)
                        && property.length <= prop.print_to_string().length + 1) {
                        return make_node(AST_Dot, self, {
                            expression: expr,
                            property: property
                        }).optimize(compressor);
                    }
                }
            }
            if (is_lhs(self, compressor.parent())) return self;
            if (key !== prop) {
                var sub = self.flatten_object(property, compressor);
                if (sub) {
                    expr = self.expression = sub.expression;
                    prop = self.property = sub.property;
                }
            }
            if (compressor.option("properties") && compressor.option("side_effects")
                && prop instanceof AST_Number && expr instanceof AST_Array) {
                var index = prop.getValue();
                var elements = expr.elements;
                if (index in elements) {
                    var flatten = true;
                    var values = [];
                    for (var i = elements.length; --i > index;) {
                        var value = elements[i].drop_side_effect_free(compressor);
                        if (value) {
                            values.unshift(value);
                            if (flatten && value.has_side_effects(compressor)) flatten = false;
                        }
                    }
                    var retValue = elements[index];
                    retValue = retValue instanceof AST_Hole ? make_node(AST_Undefined, retValue) : retValue;
                    if (!flatten) values.unshift(retValue);
                    while (--i >= 0) {
                        var value = elements[i].drop_side_effect_free(compressor);
                        if (value) values.unshift(value);
                        else index--;
                    }
                    if (flatten) {
                        values.push(retValue);
                        return make_sequence(self, values).optimize(compressor);
                    } else return make_node(AST_Sub, self, {
                        expression: make_node(AST_Array, expr, {
                            elements: values
                        }),
                        property: make_node(AST_Number, prop, {
                            value: index
                        })
                    });
                }
            }
            var ev = self.evaluate(compressor);
            if (ev !== self) {
                ev = make_node_from_constant(ev, self).optimize(compressor);
                return best_of(compressor, ev, self);
            }
            return self;
        });

        AST_Lambda.DEFMETHOD("contains_this", function() {
            var result;
            var self = this;
            self.walk(new TreeWalker(function(node) {
                if (result) return true;
                if (node instanceof AST_This) return result = true;
                if (node !== self && node instanceof AST_Scope) return true;
            }));
            return result;
        });

        AST_PropAccess.DEFMETHOD("flatten_object", function(key, compressor) {
            if (!compressor.option("properties")) return;
            var expr = this.expression;
            if (expr instanceof AST_Object) {
                var props = expr.properties;
                for (var i = props.length; --i >= 0;) {
                    var prop = props[i];
                    if ("" + prop.key == key) {
                        if (!all(props, function(prop) {
                            return prop instanceof AST_ObjectKeyVal;
                        })) break;
                        var value = prop.value;
                        if (value instanceof AST_Function
                            && !(compressor.parent() instanceof AST_New)
                            && value.contains_this()) break;
                        return make_node(AST_Sub, this, {
                            expression: make_node(AST_Array, expr, {
                                elements: props.map(function(prop) {
                                    return prop.value;
                                })
                            }),
                            property: make_node(AST_Number, this, {
                                value: i
                            })
                        });
                    }
                }
            }
        });

        OPT(AST_Dot, function(self, compressor){
            var def = self.resolve_defines(compressor);
            if (def) {
                return def.optimize(compressor);
            }
            if (compressor.option("unsafe_proto")
                && self.expression instanceof AST_Dot
                && self.expression.property == "prototype") {
                var exp = self.expression.expression;
                if (is_undeclared_ref(exp)) switch (exp.name) {
                    case "Array":
                        self.expression = make_node(AST_Array, self.expression, {
                            elements: []
                        });
                        break;
                    case "Object":
                        self.expression = make_node(AST_Object, self.expression, {
                            properties: []
                        });
                        break;
                    case "String":
                        self.expression = make_node(AST_String, self.expression, {
                            value: ""
                        });
                        break;
                }
            }
            if (is_lhs(self, compressor.parent())) return self;
            var sub = self.flatten_object(self.property, compressor);
            if (sub) return sub.optimize(compressor);
            var ev = self.evaluate(compressor);
            if (ev !== self) {
                ev = make_node_from_constant(ev, self).optimize(compressor);
                return best_of(compressor, ev, self);
            }
            return self;
        });

        function literals_in_boolean_context(self, compressor) {
            if (compressor.in_boolean_context()) {
                return best_of(compressor, self, make_sequence(self, [
                    self,
                    make_node(AST_True, self)
                ]).optimize(compressor));
            }
            return self;
        };
        OPT(AST_Array, literals_in_boolean_context);
        OPT(AST_Object, literals_in_boolean_context);
        OPT(AST_RegExp, literals_in_boolean_context);

        OPT(AST_Return, function(self, compressor){
            if (self.value && is_undefined(self.value, compressor)) {
                self.value = null;
            }
            return self;
        });

        OPT(AST_VarDef, function(self, compressor){
            var defines = compressor.option("global_defs");
            if (defines && HOP(defines, self.name.name)) {
                compressor.warn('global_defs ' + self.name.name + ' redefined [{file}:{line},{col}]', self.start);
            }
            return self;
        });

    })();


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

// a small wrapper around fitzgen's source-map library
    function SourceMap(options) {
        options = defaults(options, {
            file : null,
            root : null,
            orig : null,

            orig_line_diff : 0,
            dest_line_diff : 0,
        });
        var generator = new MOZ_SourceMap.SourceMapGenerator({
            file       : options.file,
            sourceRoot : options.root
        });
        var orig_map = options.orig && new MOZ_SourceMap.SourceMapConsumer(options.orig);

        if (orig_map && Array.isArray(options.orig.sources)) {
            orig_map._sources.toArray().forEach(function(source) {
                var sourceContent = orig_map.sourceContentFor(source, true);
                if (sourceContent) {
                    generator.setSourceContent(source, sourceContent);
                }
            });
        }

        function add(source, gen_line, gen_col, orig_line, orig_col, name) {
            if (orig_map) {
                var info = orig_map.originalPositionFor({
                    line: orig_line,
                    column: orig_col
                });
                if (info.source === null) {
                    return;
                }
                source = info.source;
                orig_line = info.line;
                orig_col = info.column;
                name = info.name || name;
            }
            generator.addMapping({
                generated : { line: gen_line + options.dest_line_diff, column: gen_col },
                original  : { line: orig_line + options.orig_line_diff, column: orig_col },
                source    : source,
                name      : name
            });
        };
        return {
            add        : add,
            get        : function() { return generator },
            toString   : function() { return JSON.stringify(generator.toJSON()); }
        };
    };


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    (function(){

        var normalize_directives = function(body) {
            var in_directive = true;

            for (var i = 0; i < body.length; i++) {
                if (in_directive && body[i] instanceof AST_Statement && body[i].body instanceof AST_String) {
                    body[i] = new AST_Directive({
                        start: body[i].start,
                        end: body[i].end,
                        value: body[i].body.value
                    });
                } else if (in_directive && !(body[i] instanceof AST_Statement && body[i].body instanceof AST_String)) {
                    in_directive = false;
                }
            }

            return body;
        };

        var MOZ_TO_ME = {
            Program: function(M) {
                return new AST_Toplevel({
                    start: my_start_token(M),
                    end: my_end_token(M),
                    body: normalize_directives(M.body.map(from_moz))
                });
            },
            FunctionDeclaration: function(M) {
                return new AST_Defun({
                    start: my_start_token(M),
                    end: my_end_token(M),
                    name: from_moz(M.id),
                    argnames: M.params.map(from_moz),
                    body: normalize_directives(from_moz(M.body).body)
                });
            },
            FunctionExpression: function(M) {
                return new AST_Function({
                    start: my_start_token(M),
                    end: my_end_token(M),
                    name: from_moz(M.id),
                    argnames: M.params.map(from_moz),
                    body: normalize_directives(from_moz(M.body).body)
                });
            },
            ExpressionStatement: function(M) {
                return new AST_SimpleStatement({
                    start: my_start_token(M),
                    end: my_end_token(M),
                    body: from_moz(M.expression)
                });
            },
            TryStatement: function(M) {
                var handlers = M.handlers || [M.handler];
                if (handlers.length > 1 || M.guardedHandlers && M.guardedHandlers.length) {
                    throw new Error("Multiple catch clauses are not supported.");
                }
                return new AST_Try({
                    start    : my_start_token(M),
                    end      : my_end_token(M),
                    body     : from_moz(M.block).body,
                    bcatch   : from_moz(handlers[0]),
                    bfinally : M.finalizer ? new AST_Finally(from_moz(M.finalizer)) : null
                });
            },
            Property: function(M) {
                var key = M.key;
                var args = {
                    start    : my_start_token(key),
                    end      : my_end_token(M.value),
                    key      : key.type == "Identifier" ? key.name : key.value,
                    value    : from_moz(M.value)
                };
                if (M.kind == "init") return new AST_ObjectKeyVal(args);
                args.key = new AST_SymbolAccessor({
                    name: args.key
                });
                args.value = new AST_Accessor(args.value);
                if (M.kind == "get") return new AST_ObjectGetter(args);
                if (M.kind == "set") return new AST_ObjectSetter(args);
            },
            ArrayExpression: function(M) {
                return new AST_Array({
                    start    : my_start_token(M),
                    end      : my_end_token(M),
                    elements : M.elements.map(function(elem){
                        return elem === null ? new AST_Hole() : from_moz(elem);
                    })
                });
            },
            ObjectExpression: function(M) {
                return new AST_Object({
                    start      : my_start_token(M),
                    end        : my_end_token(M),
                    properties : M.properties.map(function(prop){
                        prop.type = "Property";
                        return from_moz(prop)
                    })
                });
            },
            SequenceExpression: function(M) {
                return new AST_Sequence({
                    start      : my_start_token(M),
                    end        : my_end_token(M),
                    expressions: M.expressions.map(from_moz)
                });
            },
            MemberExpression: function(M) {
                return new (M.computed ? AST_Sub : AST_Dot)({
                    start      : my_start_token(M),
                    end        : my_end_token(M),
                    property   : M.computed ? from_moz(M.property) : M.property.name,
                    expression : from_moz(M.object)
                });
            },
            SwitchCase: function(M) {
                return new (M.test ? AST_Case : AST_Default)({
                    start      : my_start_token(M),
                    end        : my_end_token(M),
                    expression : from_moz(M.test),
                    body       : M.consequent.map(from_moz)
                });
            },
            VariableDeclaration: function(M) {
                return new AST_Var({
                    start       : my_start_token(M),
                    end         : my_end_token(M),
                    definitions : M.declarations.map(from_moz)
                });
            },
            Literal: function(M) {
                var val = M.value, args = {
                    start  : my_start_token(M),
                    end    : my_end_token(M)
                };
                if (val === null) return new AST_Null(args);
                switch (typeof val) {
                    case "string":
                        args.value = val;
                        return new AST_String(args);
                    case "number":
                        args.value = val;
                        return new AST_Number(args);
                    case "boolean":
                        return new (val ? AST_True : AST_False)(args);
                    default:
                        var rx = M.regex;
                        if (rx && rx.pattern) {
                            // RegExpLiteral as per ESTree AST spec
                            args.value = new RegExp(rx.pattern, rx.flags).toString();
                        } else {
                            // support legacy RegExp
                            args.value = M.regex && M.raw ? M.raw : val;
                        }
                        return new AST_RegExp(args);
                }
            },
            Identifier: function(M) {
                var p = FROM_MOZ_STACK[FROM_MOZ_STACK.length - 2];
                return new (  p.type == "LabeledStatement" ? AST_Label
                    : p.type == "VariableDeclarator" && p.id === M ? AST_SymbolVar
                        : p.type == "FunctionExpression" ? (p.id === M ? AST_SymbolLambda : AST_SymbolFunarg)
                            : p.type == "FunctionDeclaration" ? (p.id === M ? AST_SymbolDefun : AST_SymbolFunarg)
                                : p.type == "CatchClause" ? AST_SymbolCatch
                                    : p.type == "BreakStatement" || p.type == "ContinueStatement" ? AST_LabelRef
                                        : AST_SymbolRef)({
                    start : my_start_token(M),
                    end   : my_end_token(M),
                    name  : M.name
                });
            }
        };

        MOZ_TO_ME.UpdateExpression =
            MOZ_TO_ME.UnaryExpression = function To_Moz_Unary(M) {
                var prefix = "prefix" in M ? M.prefix
                    : M.type == "UnaryExpression" ? true : false;
                return new (prefix ? AST_UnaryPrefix : AST_UnaryPostfix)({
                    start      : my_start_token(M),
                    end        : my_end_token(M),
                    operator   : M.operator,
                    expression : from_moz(M.argument)
                });
            };

        map("EmptyStatement", AST_EmptyStatement);
        map("BlockStatement", AST_BlockStatement, "body@body");
        map("IfStatement", AST_If, "test>condition, consequent>body, alternate>alternative");
        map("LabeledStatement", AST_LabeledStatement, "label>label, body>body");
        map("BreakStatement", AST_Break, "label>label");
        map("ContinueStatement", AST_Continue, "label>label");
        map("WithStatement", AST_With, "object>expression, body>body");
        map("SwitchStatement", AST_Switch, "discriminant>expression, cases@body");
        map("ReturnStatement", AST_Return, "argument>value");
        map("ThrowStatement", AST_Throw, "argument>value");
        map("WhileStatement", AST_While, "test>condition, body>body");
        map("DoWhileStatement", AST_Do, "test>condition, body>body");
        map("ForStatement", AST_For, "init>init, test>condition, update>step, body>body");
        map("ForInStatement", AST_ForIn, "left>init, right>object, body>body");
        map("DebuggerStatement", AST_Debugger);
        map("VariableDeclarator", AST_VarDef, "id>name, init>value");
        map("CatchClause", AST_Catch, "param>argname, body%body");

        map("ThisExpression", AST_This);
        map("BinaryExpression", AST_Binary, "operator=operator, left>left, right>right");
        map("LogicalExpression", AST_Binary, "operator=operator, left>left, right>right");
        map("AssignmentExpression", AST_Assign, "operator=operator, left>left, right>right");
        map("ConditionalExpression", AST_Conditional, "test>condition, consequent>consequent, alternate>alternative");
        map("NewExpression", AST_New, "callee>expression, arguments@args");
        map("CallExpression", AST_Call, "callee>expression, arguments@args");

        def_to_moz(AST_Toplevel, function To_Moz_Program(M) {
            return to_moz_scope("Program", M);
        });

        def_to_moz(AST_Defun, function To_Moz_FunctionDeclaration(M) {
            return {
                type: "FunctionDeclaration",
                id: to_moz(M.name),
                params: M.argnames.map(to_moz),
                body: to_moz_scope("BlockStatement", M)
            }
        });

        def_to_moz(AST_Function, function To_Moz_FunctionExpression(M) {
            return {
                type: "FunctionExpression",
                id: to_moz(M.name),
                params: M.argnames.map(to_moz),
                body: to_moz_scope("BlockStatement", M)
            }
        });

        def_to_moz(AST_Directive, function To_Moz_Directive(M) {
            return {
                type: "ExpressionStatement",
                expression: {
                    type: "Literal",
                    value: M.value
                }
            };
        });

        def_to_moz(AST_SimpleStatement, function To_Moz_ExpressionStatement(M) {
            return {
                type: "ExpressionStatement",
                expression: to_moz(M.body)
            };
        });

        def_to_moz(AST_SwitchBranch, function To_Moz_SwitchCase(M) {
            return {
                type: "SwitchCase",
                test: to_moz(M.expression),
                consequent: M.body.map(to_moz)
            };
        });

        def_to_moz(AST_Try, function To_Moz_TryStatement(M) {
            return {
                type: "TryStatement",
                block: to_moz_block(M),
                handler: to_moz(M.bcatch),
                guardedHandlers: [],
                finalizer: to_moz(M.bfinally)
            };
        });

        def_to_moz(AST_Catch, function To_Moz_CatchClause(M) {
            return {
                type: "CatchClause",
                param: to_moz(M.argname),
                guard: null,
                body: to_moz_block(M)
            };
        });

        def_to_moz(AST_Definitions, function To_Moz_VariableDeclaration(M) {
            return {
                type: "VariableDeclaration",
                kind: "var",
                declarations: M.definitions.map(to_moz)
            };
        });

        def_to_moz(AST_Sequence, function To_Moz_SequenceExpression(M) {
            return {
                type: "SequenceExpression",
                expressions: M.expressions.map(to_moz)
            };
        });

        def_to_moz(AST_PropAccess, function To_Moz_MemberExpression(M) {
            var isComputed = M instanceof AST_Sub;
            return {
                type: "MemberExpression",
                object: to_moz(M.expression),
                computed: isComputed,
                property: isComputed ? to_moz(M.property) : {type: "Identifier", name: M.property}
            };
        });

        def_to_moz(AST_Unary, function To_Moz_Unary(M) {
            return {
                type: M.operator == "++" || M.operator == "--" ? "UpdateExpression" : "UnaryExpression",
                operator: M.operator,
                prefix: M instanceof AST_UnaryPrefix,
                argument: to_moz(M.expression)
            };
        });

        def_to_moz(AST_Binary, function To_Moz_BinaryExpression(M) {
            return {
                type: M.operator == "&&" || M.operator == "||" ? "LogicalExpression" : "BinaryExpression",
                left: to_moz(M.left),
                operator: M.operator,
                right: to_moz(M.right)
            };
        });

        def_to_moz(AST_Array, function To_Moz_ArrayExpression(M) {
            return {
                type: "ArrayExpression",
                elements: M.elements.map(to_moz)
            };
        });

        def_to_moz(AST_Object, function To_Moz_ObjectExpression(M) {
            return {
                type: "ObjectExpression",
                properties: M.properties.map(to_moz)
            };
        });

        def_to_moz(AST_ObjectProperty, function To_Moz_Property(M) {
            var key = {
                type: "Literal",
                value: M.key instanceof AST_SymbolAccessor ? M.key.name : M.key
            };
            var kind;
            if (M instanceof AST_ObjectKeyVal) {
                kind = "init";
            } else
            if (M instanceof AST_ObjectGetter) {
                kind = "get";
            } else
            if (M instanceof AST_ObjectSetter) {
                kind = "set";
            }
            return {
                type: "Property",
                kind: kind,
                key: key,
                value: to_moz(M.value)
            };
        });

        def_to_moz(AST_Symbol, function To_Moz_Identifier(M) {
            var def = M.definition();
            return {
                type: "Identifier",
                name: def ? def.mangled_name || def.name : M.name
            };
        });

        def_to_moz(AST_RegExp, function To_Moz_RegExpLiteral(M) {
            var value = M.value;
            return {
                type: "Literal",
                value: value,
                raw: value.toString(),
                regex: {
                    pattern: value.source,
                    flags: value.toString().match(/[gimuy]*$/)[0]
                }
            };
        });

        def_to_moz(AST_Constant, function To_Moz_Literal(M) {
            var value = M.value;
            if (typeof value === 'number' && (value < 0 || (value === 0 && 1 / value < 0))) {
                return {
                    type: "UnaryExpression",
                    operator: "-",
                    prefix: true,
                    argument: {
                        type: "Literal",
                        value: -value,
                        raw: M.start.raw
                    }
                };
            }
            return {
                type: "Literal",
                value: value,
                raw: M.start.raw
            };
        });

        def_to_moz(AST_Atom, function To_Moz_Atom(M) {
            return {
                type: "Identifier",
                name: String(M.value)
            };
        });

        AST_Boolean.DEFMETHOD("to_mozilla_ast", AST_Constant.prototype.to_mozilla_ast);
        AST_Null.DEFMETHOD("to_mozilla_ast", AST_Constant.prototype.to_mozilla_ast);
        AST_Hole.DEFMETHOD("to_mozilla_ast", function To_Moz_ArrayHole() { return null });

        AST_Block.DEFMETHOD("to_mozilla_ast", AST_BlockStatement.prototype.to_mozilla_ast);
        AST_Lambda.DEFMETHOD("to_mozilla_ast", AST_Function.prototype.to_mozilla_ast);

        /* -----[ tools ]----- */

        function raw_token(moznode) {
            if (moznode.type == "Literal") {
                return moznode.raw != null ? moznode.raw : moznode.value + "";
            }
        }

        function my_start_token(moznode) {
            var loc = moznode.loc, start = loc && loc.start;
            var range = moznode.range;
            return new AST_Token({
                file    : loc && loc.source,
                line    : start && start.line,
                col     : start && start.column,
                pos     : range ? range[0] : moznode.start,
                endline : start && start.line,
                endcol  : start && start.column,
                endpos  : range ? range[0] : moznode.start,
                raw     : raw_token(moznode),
            });
        };

        function my_end_token(moznode) {
            var loc = moznode.loc, end = loc && loc.end;
            var range = moznode.range;
            return new AST_Token({
                file    : loc && loc.source,
                line    : end && end.line,
                col     : end && end.column,
                pos     : range ? range[1] : moznode.end,
                endline : end && end.line,
                endcol  : end && end.column,
                endpos  : range ? range[1] : moznode.end,
                raw     : raw_token(moznode),
            });
        };

        function map(moztype, mytype, propmap) {
            var moz_to_me = "function From_Moz_" + moztype + "(M){\n";
            moz_to_me += "return new U2." + mytype.name + "({\n" +
                "start: my_start_token(M),\n" +
                "end: my_end_token(M)";

            var me_to_moz = "function To_Moz_" + moztype + "(M){\n";
            me_to_moz += "return {\n" +
                "type: " + JSON.stringify(moztype);

            if (propmap) propmap.split(/\s*,\s*/).forEach(function(prop){
                var m = /([a-z0-9$_]+)(=|@|>|%)([a-z0-9$_]+)/i.exec(prop);
                if (!m) throw new Error("Can't understand property map: " + prop);
                var moz = m[1], how = m[2], my = m[3];
                moz_to_me += ",\n" + my + ": ";
                me_to_moz += ",\n" + moz + ": ";
                switch (how) {
                    case "@":
                        moz_to_me += "M." + moz + ".map(from_moz)";
                        me_to_moz += "M." +  my + ".map(to_moz)";
                        break;
                    case ">":
                        moz_to_me += "from_moz(M." + moz + ")";
                        me_to_moz += "to_moz(M." + my + ")";
                        break;
                    case "=":
                        moz_to_me += "M." + moz;
                        me_to_moz += "M." + my;
                        break;
                    case "%":
                        moz_to_me += "from_moz(M." + moz + ").body";
                        me_to_moz += "to_moz_block(M)";
                        break;
                    default:
                        throw new Error("Can't understand operator in propmap: " + prop);
                }
            });

            moz_to_me += "\n})\n}";
            me_to_moz += "\n}\n}";

            //moz_to_me = parse(moz_to_me).print_to_string({ beautify: true });
            //me_to_moz = parse(me_to_moz).print_to_string({ beautify: true });
            //console.log(moz_to_me);

            moz_to_me = new Function("U2", "my_start_token", "my_end_token", "from_moz", "return(" + moz_to_me + ")")(
                exports, my_start_token, my_end_token, from_moz
            );
            me_to_moz = new Function("to_moz", "to_moz_block", "to_moz_scope", "return(" + me_to_moz + ")")(
                to_moz, to_moz_block, to_moz_scope
            );
            MOZ_TO_ME[moztype] = moz_to_me;
            def_to_moz(mytype, me_to_moz);
        };

        var FROM_MOZ_STACK = null;

        function from_moz(node) {
            FROM_MOZ_STACK.push(node);
            var ret = node != null ? MOZ_TO_ME[node.type](node) : null;
            FROM_MOZ_STACK.pop();
            return ret;
        };

        AST_Node.from_mozilla_ast = function(node){
            var save_stack = FROM_MOZ_STACK;
            FROM_MOZ_STACK = [];
            var ast = from_moz(node);
            FROM_MOZ_STACK = save_stack;
            return ast;
        };

        function set_moz_loc(mynode, moznode, myparent) {
            var start = mynode.start;
            var end = mynode.end;
            if (start.pos != null && end.endpos != null) {
                moznode.range = [start.pos, end.endpos];
            }
            if (start.line) {
                moznode.loc = {
                    start: {line: start.line, column: start.col},
                    end: end.endline ? {line: end.endline, column: end.endcol} : null
                };
                if (start.file) {
                    moznode.loc.source = start.file;
                }
            }
            return moznode;
        };

        function def_to_moz(mytype, handler) {
            mytype.DEFMETHOD("to_mozilla_ast", function() {
                return set_moz_loc(this, handler(this));
            });
        };

        function to_moz(node) {
            return node != null ? node.to_mozilla_ast() : null;
        };

        function to_moz_block(node) {
            return {
                type: "BlockStatement",
                body: node.body.map(to_moz)
            };
        };

        function to_moz_scope(type, node) {
            var body = node.body.map(to_moz);
            if (node.body[0] instanceof AST_SimpleStatement && node.body[0].body instanceof AST_String) {
                body.unshift(to_moz(new AST_EmptyStatement(node.body[0])));
            }
            return {
                type: type,
                body: body
            };
        };
    })();


    /***********************************************************************

     A JavaScript tokenizer / parser / beautifier / compressor.
     https://github.com/mishoo/UglifyJS2

     -------------------------------- (C) ---------------------------------

     Author: Mihai Bazon
     <mihai.bazon@gmail.com>
     http://mihai.bazon.net/blog

     Distributed under the BSD license:

     Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions
     are met:

     * Redistributions of source code must retain the above
     copyright notice, this list of conditions and the following
     disclaimer.

     * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following
     disclaimer in the documentation and/or other materials
     provided with the distribution.

     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
     EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
     IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
     LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
     OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
     THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
     TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
     THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
     SUCH DAMAGE.

     ***********************************************************************/

    "use strict";

    function find_builtins(reserved) {
        // NaN will be included due to Number.NaN
        [
            "null",
            "true",
            "false",
            "Infinity",
            "-Infinity",
            "undefined",
        ].forEach(add);
        [ Object, Array, Function, Number,
            String, Boolean, Error, Math,
            Date, RegExp
        ].forEach(function(ctor){
            Object.getOwnPropertyNames(ctor).map(add);
            if (ctor.prototype) {
                Object.getOwnPropertyNames(ctor.prototype).map(add);
            }
        });
        function add(name) {
            push_uniq(reserved, name);
        }
    }

    function reserve_quoted_keys(ast, reserved) {
        function add(name) {
            push_uniq(reserved, name);
        }

        ast.walk(new TreeWalker(function(node) {
            if (node instanceof AST_ObjectKeyVal && node.quote) {
                add(node.key);
            } else if (node instanceof AST_Sub) {
                addStrings(node.property, add);
            }
        }));
    }

    function addStrings(node, add) {
        node.walk(new TreeWalker(function(node) {
            if (node instanceof AST_Sequence) {
                addStrings(node.tail_node(), add);
            } else if (node instanceof AST_String) {
                add(node.value);
            } else if (node instanceof AST_Conditional) {
                addStrings(node.consequent, add);
                addStrings(node.alternative, add);
            }
            return true;
        }));
    }

    function mangle_properties(ast, options) {
        options = defaults(options, {
            builtins: false,
            cache: null,
            debug: false,
            keep_quoted: false,
            only_cache: false,
            regex: null,
            reserved: null,
        }, true);

        var reserved = options.reserved;
        if (!Array.isArray(reserved)) reserved = [];
        if (!options.builtins) find_builtins(reserved);

        var cache = options.cache;
        if (cache == null) {
            cache = {
                cname: -1,
                props: new Dictionary()
            };
        }

        var regex = options.regex;

        // note debug is either false (disabled), or a string of the debug suffix to use (enabled).
        // note debug may be enabled as an empty string, which is falsey. Also treat passing 'true'
        // the same as passing an empty string.
        var debug = options.debug !== false;
        var debug_name_suffix;
        if (debug) {
            debug_name_suffix = (options.debug === true ? "" : options.debug);
        }

        var names_to_mangle = [];
        var unmangleable = [];

        // step 1: find candidates to mangle
        ast.walk(new TreeWalker(function(node){
            if (node instanceof AST_ObjectKeyVal) {
                add(node.key);
            }
            else if (node instanceof AST_ObjectProperty) {
                // setter or getter, since KeyVal is handled above
                add(node.key.name);
            }
            else if (node instanceof AST_Dot) {
                add(node.property);
            }
            else if (node instanceof AST_Sub) {
                addStrings(node.property, add);
            }
        }));

        // step 2: transform the tree, renaming properties
        return ast.transform(new TreeTransformer(function(node){
            if (node instanceof AST_ObjectKeyVal) {
                node.key = mangle(node.key);
            }
            else if (node instanceof AST_ObjectProperty) {
                // setter or getter
                node.key.name = mangle(node.key.name);
            }
            else if (node instanceof AST_Dot) {
                node.property = mangle(node.property);
            }
            else if (!options.keep_quoted && node instanceof AST_Sub) {
                node.property = mangleStrings(node.property);
            }
        }));

        // only function declarations after this line

        function can_mangle(name) {
            if (unmangleable.indexOf(name) >= 0) return false;
            if (reserved.indexOf(name) >= 0) return false;
            if (options.only_cache) {
                return cache.props.has(name);
            }
            if (/^-?[0-9]+(\.[0-9]+)?(e[+-][0-9]+)?$/.test(name)) return false;
            return true;
        }

        function should_mangle(name) {
            if (regex && !regex.test(name)) return false;
            if (reserved.indexOf(name) >= 0) return false;
            return cache.props.has(name)
                || names_to_mangle.indexOf(name) >= 0;
        }

        function add(name) {
            if (can_mangle(name))
                push_uniq(names_to_mangle, name);

            if (!should_mangle(name)) {
                push_uniq(unmangleable, name);
            }
        }

        function mangle(name) {
            if (!should_mangle(name)) {
                return name;
            }

            var mangled = cache.props.get(name);
            if (!mangled) {
                if (debug) {
                    // debug mode: use a prefix and suffix to preserve readability, e.g. o.foo -> o._$foo$NNN_.
                    var debug_mangled = "_$" + name + "$" + debug_name_suffix + "_";

                    if (can_mangle(debug_mangled)) {
                        mangled = debug_mangled;
                    }
                }

                // either debug mode is off, or it is on and we could not use the mangled name
                if (!mangled) {
                    do {
                        mangled = base54(++cache.cname);
                    } while (!can_mangle(mangled));
                }

                cache.props.set(name, mangled);
            }
            return mangled;
        }

        function mangleStrings(node) {
            return node.transform(new TreeTransformer(function(node){
                if (node instanceof AST_Sequence) {
                    var last = node.expressions.length - 1;
                    node.expressions[last] = mangleStrings(node.expressions[last]);
                }
                else if (node instanceof AST_String) {
                    node.value = mangle(node.value);
                }
                else if (node instanceof AST_Conditional) {
                    node.consequent = mangleStrings(node.consequent);
                    node.alternative = mangleStrings(node.alternative);
                }
                return node;
            }));
        }
    }


    "use strict";

    var to_ascii = typeof atob == "undefined" ? function (b64) {
        return new Buffer(b64, "base64").toString();
    } : atob;
    var to_base64 = typeof btoa == "undefined" ? function (str) {
        return new Buffer(str).toString("base64");
    } : btoa;

    function read_source_map(code) {
        var match = /\n\/\/# sourceMappingURL=data:application\/json(;.*?)?;base64,(.*)/.exec(code);
        if (!match) {
            AST_Node.warn("inline source map not found");
            return null;
        }
        return to_ascii(match[2]);
    }

    /**
     * 将name配置项添加到keys的子配置中
     * @param {string} name 需要添加的配置项
     * @param {Dictionary} options 配置
     * @param {Array} keys 目标配置项列表
     */
    function set_shorthand(name, options, keys) {
        if (options[name]) {
            keys.forEach(function (key) {
                if (options[key]) {
                    if (typeof options[key] != "object") options[key] = {};
                    if (!(name in options[key])) options[key][name] = options[name];
                }
            });
        }
    }

    function init_cache(cache) {
        if (!cache) return;
        if (!("cname" in cache)) cache.cname = -1;
        if (!("props" in cache)) {
            cache.props = new Dictionary();
        } else if (!(cache.props instanceof Dictionary)) {
            cache.props = Dictionary.fromObject(cache.props);
        }
    }

    function to_json(cache) {
        return {
            cname: cache.cname,
            props: cache.props.toObject()
        };
    }

// function deepCopyAST(obj, obj_type) {
//   var return_obj = new obj_type();
//   for (var name in obj) {
//     if (typeof obj[name] == 'undefined' || obj[name] === null || typeof obj[name] != 'object') {
//       return_obj[name] = obj[name];
//     } else {
//       return_obj[name] = deepCopyAST(obj[name], obj[name].constructor);
//     }
//   }
//   return return_obj;
// }

    function changeAST_NodeAssign(obj, value) {
        obj.end.raw = value.toString();
        obj.end.value = value;
        obj.start.raw = value.toString();
        obj.start.value = value;
        obj.value = value;
        return obj;
    }

    function createWhileCase() {
        return new AST_Case({
            end: new AST_Token({
                raw: undefined,
                file: null,
                comments_after: [],
                comments_before: [],
                nlb: false,
                value: ';',
                type: 'punc'
            }),
            start: new AST_Token({
                raw: undefined,
                file: null,
                comments_after: [],
                comments_before: [],
                nlb: true,
                value: 'case',
                type: 'keyword'
            }),
            body: [
                new AST_StatementWithBody({
                    end: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: false,
                        value: ';',
                        type: 'punc'
                    }),
                    start: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: true,
                        value: 'next',
                        type: 'name'
                    }),
                    body: new AST_Assign({
                        end: new AST_Token({
                            raw: '1',
                            file: null,
                            comments_after: [],
                            comments_before: [],
                            nlb: false,
                            value: 1,
                            type: 'num'
                        }),
                        start: new AST_Token({
                            raw: undefined,
                            file: null,
                            comments_after: [],
                            comments_before: [],
                            nlb: true,
                            value: 'next',
                            type: 'name'
                        }),
                        right: new AST_Number({
                            end: new AST_Token({
                                raw: '1',
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: false,
                                value: 1,
                                type: 'num'
                            }),
                            start: new AST_Token({
                                raw: '1',
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: false,
                                value: 1,
                                type: 'num'
                            }),
                            value: 1
                        }),
                        left: new AST_Symbol({
                            end: new AST_Token({
                                raw: undefined,
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: true,
                                value: 'next',
                                type: 'name'
                            }),
                            start: new AST_Token({
                                raw: undefined,
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: true,
                                value: 'next',
                                type: 'name'
                            }),
                            name: 'next'
                        }),
                        operator: '='
                    })
                }),
                new AST_Break({
                    end: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: false,
                        value: ';',
                        type: 'punc'
                    }),
                    start: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: true,
                        value: 'break',
                        type: 'keyword'
                    }),
                    label: null
                })
            ],
            expression: new AST_Number({
                end: new AST_Token({
                    raw: '1',
                    file: null,
                    comments_after: [],
                    comments_before: [],
                    nlb: false,
                    value: 1,
                    type: 'num'
                }),
                start: new AST_Token({
                    raw: '1',
                    file: null,
                    comments_after: [],
                    comments_before: [],
                    nlb: false,
                    value: 1,
                    type: 'num'
                }),
                value: 1
            })
        });
    }

    function createFunctionCase() {
        return new AST_Case({
            end: new AST_Token({
                raw: undefined,
                file: null,
                comments_after: [],
                comments_before: [],
                nlb: false,
                value: ';',
                type: 'punc'
            }),
            start: new AST_Token({
                raw: undefined,
                file: null,
                comments_after: [],
                comments_before: [],
                nlb: true,
                value: 'case',
                type: 'keyword'
            }),
            body: [
                new AST_StatementWithBody({
                    end: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: false,
                        value: ';',
                        type: 'punc'
                    }),
                    start: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: true,
                        value: 'this',
                        type: 'name'
                    }),
                    body: new AST_Assign({
                        end: new AST_Token({
                            raw: '1',
                            file: null,
                            comments_after: [],
                            comments_before: [],
                            nlb: false,
                            value: 1,
                            type: 'num'
                        }),
                        start: new AST_Token({
                            raw: undefined,
                            file: null,
                            comments_after: [],
                            comments_before: [],
                            nlb: true,
                            value: 'this',
                            type: 'name'
                        }),
                        right: new AST_Number({
                            end: new AST_Token({
                                raw: '1',
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: false,
                                value: 1,
                                type: 'num'
                            }),
                            start: new AST_Token({
                                raw: '1',
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: false,
                                value: 1,
                                type: 'num'
                            }),
                            value: 1
                        }),
                        left: new AST_PropAccess({
                            end: new AST_Token({
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: false,
                                value: 'next',
                                type: 'name'
                            }),
                            start: new AST_Token({
                                file: null,
                                comments_after: [],
                                comments_before: [],
                                nlb: true,
                                value: 'this',
                                type: 'name'
                            }),
                            property: 'next',
                            expression: new AST_Symbol({
                                end: new AST_Token({
                                    file: null,
                                    comments_after: [],
                                    comments_before: [],
                                    nlb: true,
                                    value: 'this',
                                    type: 'name'
                                }),
                                start: new AST_Token({
                                    file: null,
                                    comments_after: [],
                                    comments_before: [],
                                    nlb: true,
                                    value: 'this',
                                    type: 'name'
                                }),
                                name: 'this'
                            })
                        }),
                        operator: '='
                    })
                }),
                new AST_Break({
                    end: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: false,
                        value: ';',
                        type: 'punc'
                    }),
                    start: new AST_Token({
                        raw: undefined,
                        file: null,
                        comments_after: [],
                        comments_before: [],
                        nlb: true,
                        value: 'break',
                        type: 'keyword'
                    }),
                    label: null
                })
            ],
            expression: new AST_Number({
                end: new AST_Token({
                    raw: '1',
                    file: null,
                    comments_after: [],
                    comments_before: [],
                    nlb: false,
                    value: 1,
                    type: 'num'
                }),
                start: new AST_Token({
                    raw: '1',
                    file: null,
                    comments_after: [],
                    comments_before: [],
                    nlb: false,
                    value: 1,
                    type: 'num'
                }),
                value: 1
            })
        });
    }

    function whileFlatten(fs, while_item) {
        var code = fs.readFileSync('./template/while.js', 'utf8');
        var result = parse(code).body[0];
        var length = while_item.body.body.length + 1;

        var if_ast_condition = result.body.body[0].condition;
        if_ast_condition.right = changeAST_NodeAssign(if_ast_condition.right, length)

        var switch_ast = result.body.body[1];
        switch_ast.body[0].body[0].condition = while_item.condition;

        var first_if_final = switch_ast.body[0].body[0].alternative.body[0].body;
        first_if_final.end.raw = length.toString();
        first_if_final.end.value = length;
        first_if_final.right = changeAST_NodeAssign(first_if_final.right, length);

        while_item.body.body.forEach(function (while_body, index) {
            //创建新的case节点，否则会遭遇deep clone问题，比较蛋疼

            var temp = createWhileCase();
            temp.expression = changeAST_NodeAssign(temp.expression, 1 + index);

            var num = 2 + index;
            if (index == while_item.body.body.length - 1) {
                //此处为动态找自构不透明谓词词典
                num = 0;
            }
            temp.body[0].body.end.raw = num.toString();
            temp.body[0].body.end.value = num;
            temp.body[0].body.right = changeAST_NodeAssign(temp.body[0].body.right, num);

            temp.body.unshift(while_body);
            switch_ast.body.push(temp);
        });

        return result;
    }

    function functionFlatten(fs, function_item) {
        var code = fs.readFileSync('./template/function.js', 'utf8');
        var result = parse(code).body[0];

        var definitions = result.definitions[0];
        definitions.start.value = function_item.name.name;
        definitions.name.end.value = function_item.name.name;
        definitions.name.start.value = function_item.name.name;
        definitions.name.name = function_item.name.name;

        var func = definitions.value;
        func.argnames = function_item.argnames;
        //for循环
        var func_body = func.body[1];
        var length = function_item.body.length + 1;

        var if_ast_condition = func_body.body.body[0].condition;
        if_ast_condition.right = changeAST_NodeAssign(if_ast_condition.right, length);

        var switch_ast = func_body.body.body[1];
        function_item.body.forEach(function (function_body, index) {
            //创建新的case节点，否则会遭遇deep clone问题，比较蛋疼

            var temp = createWhileCase();
            temp.expression = changeAST_NodeAssign(temp.expression, 1 + index);

            var num = 2 + index;

            temp.body[0].body.end.raw = num.toString();
            temp.body[0].body.end.value = num;
            temp.body[0].body.right = changeAST_NodeAssign(temp.body[0].body.right, num);

            temp.body.unshift(function_body);
            switch_ast.body.push(temp);
        });

        return result;
    }

    function minify(fs, files, options) {
        var warn_function = AST_Node.warn_function;
        try {
            options = defaults(options, {
                compress: {},
                ie8: false,
                keep_fnames: false,
                mangle: {},
                nameCache: null,
                output: {},
                parse: {},
                rename: undefined,
                sourceMap: false,
                timings: false,
                toplevel: false,
                warnings: false,
                wrap: false,
            }, true);
            var timings = options.timings && {
                start: Date.now()
            };
            if (options.rename === undefined) {
                // 逻辑与，expr1 && expr2，如果expr1 能转换成false则返回expr1，否则返回expr2。
                // 能够转换为false的表达式有：
                // null；
                // NaN；
                // 0；
                // 空字符串（""）；
                // undefined。
                options.rename = options.compress && options.mangle;
            }
            set_shorthand("ie8", options, ["compress", "mangle", "output"]);
            set_shorthand("keep_fnames", options, ["compress", "mangle"]);
            set_shorthand("toplevel", options, ["compress", "mangle"]);
            set_shorthand("warnings", options, ["compress"]);
            var quoted_props;
            if (options.mangle) {
                options.mangle = defaults(options.mangle, {
                    cache: options.nameCache && (options.nameCache.vars || {}),
                    eval: false,
                    ie8: false,
                    keep_fnames: false,
                    properties: false,
                    reserved: [],
                    toplevel: false,
                }, true);
                if (options.mangle.properties) {
                    if (typeof options.mangle.properties != "object") {
                        options.mangle.properties = {};
                    }
                    if (options.mangle.properties.keep_quoted) {
                        quoted_props = options.mangle.properties.reserved;
                        if (!Array.isArray(quoted_props)) quoted_props = [];
                        options.mangle.properties.reserved = quoted_props;
                    }
                    if (options.nameCache && !("cache" in options.mangle.properties)) {
                        options.mangle.properties.cache = options.nameCache.props || {};
                    }
                }
                init_cache(options.mangle.cache);
                init_cache(options.mangle.properties.cache);
            }
            if (options.sourceMap) {
                options.sourceMap = defaults(options.sourceMap, {
                    content: null,
                    filename: null,
                    includeSources: false,
                    root: null,
                    url: null,
                }, true);
            }
            var warnings = [];
            if (options.warnings && !AST_Node.warn_function) {
                AST_Node.warn_function = function (warning) {
                    warnings.push(warning);
                };
            }
            if (timings) timings.parse = Date.now();
            var toplevel;
            if (files instanceof AST_Toplevel) {
                toplevel = files;
            } else {
                if (typeof files == "string") {
                    files = [files];
                }
                options.parse = options.parse || {};
                options.parse.toplevel = null;
                for (var name in files) if (HOP(files, name)) {
                    options.parse.filename = name;
                    options.parse.toplevel = parse(files[name], options.parse);


                    options.parse.toplevel.body.forEach(function (item, index) {
                        //应该使用递归
                        if (item.start.value === 'while') {
                            //可以使用在while上，更可以使用在整个文件上
                            options.parse.toplevel.body[index] = whileFlatten(fs, item);
                        } else if (item.start.value === 'function') {
                            options.parse.toplevel.body[index] = functionFlatten(fs, item);
                        }
                    });

                    if (options.sourceMap && options.sourceMap.content == "inline") {
                        if (Object.keys(files).length > 1)
                            throw new Error("inline source map only works with singular input");
                        options.sourceMap.content = read_source_map(files[name]);
                    }
                }
                toplevel = options.parse.toplevel;
            }
            if (quoted_props) {
                reserve_quoted_keys(toplevel, quoted_props);
            }
            if (options.wrap) {
                toplevel = toplevel.wrap_commonjs(options.wrap);
            }
            if (timings) timings.rename = Date.now();
            if (options.rename) {
                toplevel.figure_out_scope(options.mangle);
                toplevel.expand_names(options.mangle);
            }
            if (timings) timings.compress = Date.now();
            if (options.compress) toplevel = new Compressor(options.compress).compress(toplevel);
            if (timings) timings.scope = Date.now();
            if (options.mangle) toplevel.figure_out_scope(options.mangle);
            if (timings) timings.mangle = Date.now();
            if (options.mangle) {
                base54.reset();
                toplevel.compute_char_frequency(options.mangle);
                toplevel.mangle_names(options.mangle);
            }
            if (timings) timings.properties = Date.now();
            if (options.mangle && options.mangle.properties) {
                toplevel = mangle_properties(toplevel, options.mangle.properties);
            }
            if (timings) timings.output = Date.now();
            var result = {};
            if (options.output.ast) {
                result.ast = toplevel;
            }
            if (!HOP(options.output, "code") || options.output.code) {
                if (options.sourceMap) {
                    if (typeof options.sourceMap.content == "string") {
                        options.sourceMap.content = JSON.parse(options.sourceMap.content);
                    }
                    options.output.source_map = SourceMap({
                        file: options.sourceMap.filename,
                        orig: options.sourceMap.content,
                        root: options.sourceMap.root
                    });
                    if (options.sourceMap.includeSources) {
                        if (files instanceof AST_Toplevel) {
                            throw new Error("original source content unavailable");
                        } else for (var name in files) if (HOP(files, name)) {
                            options.output.source_map.get().setSourceContent(name, files[name]);
                        }
                    }
                }
                delete options.output.ast;
                delete options.output.code;
                var stream = OutputStream(options.output);
                toplevel.print(stream);
                result.code = stream.get();
                if (options.sourceMap) {
                    result.map = options.output.source_map.toString();
                    if (options.sourceMap.url == "inline") {
                        result.code += "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," + to_base64(result.map);
                    } else if (options.sourceMap.url) {
                        result.code += "\n//# sourceMappingURL=" + options.sourceMap.url;
                    }
                }
            }
            if (options.nameCache && options.mangle) {
                if (options.mangle.cache) options.nameCache.vars = to_json(options.mangle.cache);
                if (options.mangle.properties && options.mangle.properties.cache) {
                    options.nameCache.props = to_json(options.mangle.properties.cache);
                }
            }
            if (timings) {
                timings.end = Date.now();
                result.timings = {
                    parse: 1e-3 * (timings.rename - timings.parse),
                    rename: 1e-3 * (timings.compress - timings.rename),
                    compress: 1e-3 * (timings.scope - timings.compress),
                    scope: 1e-3 * (timings.mangle - timings.scope),
                    mangle: 1e-3 * (timings.properties - timings.mangle),
                    properties: 1e-3 * (timings.output - timings.properties),
                    output: 1e-3 * (timings.end - timings.output),
                    total: 1e-3 * (timings.end - timings.start)
                }
            }
            if (warnings.length) {
                result.warnings = warnings;
            }
            return result;
        } catch (ex) {
            return {error: ex};
        } finally {
            AST_Node.warn_function = warn_function;
        }
    }

    exports["Dictionary"] = Dictionary;
    exports["TreeWalker"] = TreeWalker;
    exports["TreeTransformer"] = TreeTransformer;
    exports["minify"] = minify;
    exports["parse"] = parse;
    exports["_push_uniq"] = push_uniq;


    exports.describe_ast = function describe_ast() {
        var out = OutputStream({ beautify: true });
        function doitem(ctor) {
            out.print("AST_" + ctor.TYPE);
            var props = ctor.SELF_PROPS.filter(function(prop){
                return !/^\$/.test(prop);
            });
            if (props.length > 0) {
                out.space();
                out.with_parens(function(){
                    props.forEach(function(prop, i){
                        if (i) out.space();
                        out.print(prop);
                    });
                });
            }
            if (ctor.documentation) {
                out.space();
                out.print_string(ctor.documentation);
            }
            if (ctor.SUBCLASSES.length > 0) {
                out.space();
                out.with_block(function(){
                    ctor.SUBCLASSES.forEach(function(ctor, i){
                        out.indent();
                        doitem(ctor);
                        out.newline();
                    });
                });
            }
        };
        doitem(AST_Node);
        return out + "\n";
    }
})(require("source-map"), UglifyJS);