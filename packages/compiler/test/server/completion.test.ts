import { deepStrictEqual, ok, strictEqual } from "assert";
import { describe, it } from "vitest";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionList,
  MarkupKind,
} from "vscode-languageserver/node.js";
import {
  createTestServerHost,
  extractCursor,
  extractSquiggles,
} from "../../src/testing/test-server-host.js";

// cspell:ignore 𐌰𐌲𐌰𐌲𐌰𐌲

describe("complete statement keywords", () => {
  describe.each([
    // Top level only
    ["import", false],
    ["using", false],
    // Namespace and top level
    ["model", true],
    ["op", true],
    ["extern", true],
    ["dec", true],
    ["alias", true],
    ["namespace", true],
    ["import", true],
    ["interface", true],
    ["scalar", true],
    ["union", true],
    ["enum", true],
    ["fn", true],
    ["const", true],
  ])("%s", (keyword, inNamespace) => {
    describe.each(inNamespace ? ["top level", "namespace"] : ["top level"])("%s", () => {
      it("complete with no text", async () => {
        const completions = await complete(`┆`);

        check(completions, [
          {
            label: keyword,
            kind: CompletionItemKind.Keyword,
          },
        ]);
      });
      it("complete with start of keyword", async () => {
        const completions = await complete(`${keyword.slice(0, 1)}┆`);

        check(completions, [
          {
            label: keyword,
            kind: CompletionItemKind.Keyword,
          },
        ]);
      });
    });
  });
});

describe("imports", () => {
  describe("library imports", () => {
    async function testCompleteLibrary(code: string) {
      const { source, pos, end } = extractSquiggles(code);
      const completions = await complete(source, undefined, {
        "test/package.json": JSON.stringify({
          dependencies: {
            "@typespec/library1": "~0.1.0",
            "non-typespec-library": "~0.1.0",
          },
          peerDependencies: {
            "@typespec/library2": "~0.1.0",
          },
        }),
        "test/node_modules/@typespec/library1/package.json": JSON.stringify({
          tspMain: "./foo.js",
        }),
        "test/node_modules/non-typespec-library/package.json": JSON.stringify({}),
        "test/node_modules/@typespec/library2/package.json": JSON.stringify({
          tspMain: "./foo.js",
        }),
      });

      const expectedRange = {
        start: { character: pos, line: 0 },
        end: {
          character: end - 1 /** End is offset by one because there is the cursor charchater */,
          line: 0,
        },
      };
      check(
        completions,
        [
          {
            label: "@typespec/library1",
            textEdit: {
              newText: "@typespec/library1",
              range: expectedRange,
            },
            kind: CompletionItemKind.Module,
          },
          {
            label: "@typespec/library2",
            kind: CompletionItemKind.Module,
            textEdit: {
              newText: "@typespec/library2",
              range: expectedRange,
            },
          },
        ],
        {
          allowAdditionalCompletions: false,
        }
      );
    }
    it(`complete at start of "`, () => testCompleteLibrary(` import "~~~┆~~~"`));
    it("complete after some text in import", () =>
      testCompleteLibrary(` import "~~~@typespec┆~~~"`));
    it("complete in middle of import", () => testCompleteLibrary(` import "~~~@typespec┆libr~~~"`));

    it("doesn't include imports when there is no project package.json", async () => {
      const completions = await complete(` import "┆ `);

      check(completions, [], {
        allowAdditionalCompletions: false,
      });
    });

    it("completes imports without any dependencies", async () => {
      const completions = await complete(` import "┆ `, undefined, {
        "test/package.json": JSON.stringify({}),
      });

      check(completions, [], {
        allowAdditionalCompletions: false,
      });
    });
  });

  describe("relative path import", () => {
    it("complete import for relative path", async () => {
      const completions = await complete(` import "./┆ `, undefined, {
        "test/bar.tsp": "",
        "test/foo.tsp": "",
        "test/dir/test.tsp": "",
      });
      const range = { start: { line: 0, character: 11 }, end: { line: 0, character: 11 } };
      check(
        completions,
        [
          {
            label: "bar.tsp",
            kind: CompletionItemKind.File,
            textEdit: {
              newText: "bar.tsp",
              range,
            },
          },
          {
            label: "foo.tsp",
            kind: CompletionItemKind.File,
            textEdit: {
              newText: "foo.tsp",
              range,
            },
          },
          {
            label: "dir",
            kind: CompletionItemKind.Folder,
            textEdit: {
              newText: "dir",
              range,
            },
          },
        ],
        {
          allowAdditionalCompletions: false,
        }
      );
    });

    it("complete import for relative path excludes node_modules", async () => {
      const completions = await complete(` import "./┆ `, undefined, {
        "test/node_modules/test.tsp": "",
        "test/main/test.tsp": "",
        "test/node_modules/foo/test.tsp": "",
      });
      check(
        completions,
        [
          {
            kind: 19,
            label: "main",
            textEdit: {
              newText: "main",
              range: { start: { line: 0, character: 11 }, end: { line: 0, character: 11 } },
            },
          },
        ],
        {
          allowAdditionalCompletions: false,
        }
      );
    });

    it("complete import for relative path after node_modules folder", async () => {
      const completions = await complete(` import "./node_modules/┆ `, undefined, {
        "test/node_modules/foo.tsp": "",
      });
      check(
        completions,
        [
          {
            kind: 17,
            label: "foo.tsp",
            textEdit: {
              newText: "foo.tsp",
              range: { start: { line: 0, character: 24 }, end: { line: 0, character: 24 } },
            },
          },
        ],
        {
          allowAdditionalCompletions: false,
        }
      );
    });

    it("import './folder/|' --> don't complete 'folder' complete what's in folder", async () => {
      const completions = await complete(` import "./bar/┆ `, undefined, {
        "test/bar/foo.tsp": "",
      });
      check(
        completions,
        [
          {
            kind: 17,
            label: "foo.tsp",
            textEdit: {
              newText: "foo.tsp",
              range: { start: { line: 0, character: 15 }, end: { line: 0, character: 15 } },
            },
          },
        ],
        {
          allowAdditionalCompletions: false,
        }
      );
    });

    it("complete import for relative path excludes the file evaluated", async () => {
      const completions = await complete(` import "./┆ `, undefined, {
        "test/test.tsp": "",
      });
      check(completions, [], {
        allowAdditionalCompletions: false,
      });
    });
  });
});

describe("identifiers", () => {
  it("builtin types", async () => {
    const completions = await complete(
      `
      model M {
        s: ┆
      }
      `
    );
    check(completions, [
      {
        label: "int32",
        insertText: "int32",
        kind: CompletionItemKind.Unit,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\nscalar int32\n```",
        },
      },
      {
        label: "Record",
        insertText: "Record",
        kind: CompletionItemKind.Class,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\nmodel Record<Element>\n```",
        },
      },
    ]);
  });
  it("completes decorators on namespaces", async () => {
    const completions = await complete(
      `
      @┆
      namespace N {}
      `
    );
    check(completions, [
      {
        label: "doc",
        insertText: "doc",
        kind: CompletionItemKind.Function,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\ndec doc(target: unknown, doc: valueof string, formatArgs?: {})\n```",
        },
      },
    ]);
  });

  it("completes augment decorators", async () => {
    const completions = await complete(
      `
      @@┆
      `
    );
    check(completions, [
      {
        label: "doc",
        insertText: "doc",
        kind: CompletionItemKind.Function,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\ndec doc(target: unknown, doc: valueof string, formatArgs?: {})\n```",
        },
      },
    ]);
  });

  it("does not complete functions or decorators in type position", async () => {
    const completions = await complete(
      `
      model M {
        s: ┆
      }
      `
    );

    deepStrictEqual(
      [],
      completions.items.filter(
        (c) => c.label === "doc" || c.label === "getDoc" || c.kind === CompletionItemKind.Function
      )
    );
  });

  it("completes decorators on models", async () => {
    const completions = await complete(
      `
      @┆
      model M {}
      `
    );

    check(completions, [
      {
        label: "doc",
        insertText: "doc",
        kind: CompletionItemKind.Function,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\ndec doc(target: unknown, doc: valueof string, formatArgs?: {})\n```",
        },
      },
    ]);
  });

  it("completes partial identifiers", async () => {
    const completions = await complete(
      `
      model M {
        s: stri┆
      }
      `
    );
    check(completions, [
      {
        label: "string",
        insertText: "string",
        kind: CompletionItemKind.Unit,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "```typespec\nscalar string\n```",
        },
      },
    ]);
  });

  it("completes partial backticked identifiers", async () => {
    const completions = await complete(
      `
      enum \`enum\` {
        \`foo-bar\`
      }
      model M {
        s: \`enum\`.f┆
      }
      `
    );
    check(completions, [
      {
        label: "foo-bar",
        insertText: "`foo-bar`",
        kind: CompletionItemKind.EnumMember,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "(enum member)\n```typespec\n`enum`.`foo-bar`\n```",
        },
      },
    ]);
  });

  it("completes partial identifier with astral character", async () => {
    const completions = await complete(
      `
      model 𐌰𐌲𐌰𐌲𐌰𐌲 {}
      model M {
        s: 𐌰𐌲┆
      }
      `
    );

    check(completions, [
      {
        label: "𐌰𐌲𐌰𐌲𐌰𐌲",
        insertText: "𐌰𐌲𐌰𐌲𐌰𐌲",
        kind: CompletionItemKind.Class,
        documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel 𐌰𐌲𐌰𐌲𐌰𐌲\n```" },
      },
    ]);
  });

  it("completes namespace members", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B {}
      }

      model M extends N.┆
      `
    );

    check(
      completions,
      [
        {
          label: "A",
          insertText: "A",
          kind: CompletionItemKind.Class,
          documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel N.A\n```" },
        },
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Class,
          documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel N.B\n```" },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes enum members", async () => {
    const completions = await complete(
      `
      enum Fruit {
        Orange,
        Banana
      }

      model M {
        f: Fruit.┆
      }
      `
    );

    check(
      completions,
      [
        {
          label: "Orange",
          insertText: "Orange",
          kind: CompletionItemKind.EnumMember,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(enum member)\n```typespec\nFruit.Orange\n```",
          },
        },
        {
          label: "Banana",
          insertText: "Banana",
          kind: CompletionItemKind.EnumMember,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(enum member)\n```typespec\nFruit.Banana\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes union variants", async () => {
    const completions = await complete(
      `
      model Orange {}
      model Banana {}
      union Fruit {
        orange: Orange,
        banana: Banana
      }

      model M {
        f: Fruit.┆
      }
      `
    );

    check(
      completions,
      [
        {
          label: "orange",
          insertText: "orange",
          kind: CompletionItemKind.EnumMember,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(union variant)\n```typespec\nFruit.orange: Orange\n```",
          },
        },
        {
          label: "banana",
          insertText: "banana",
          kind: CompletionItemKind.EnumMember,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(union variant)\n```typespec\nFruit.banana: Banana\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes namespace operations", async () => {
    const completions = await complete(
      `
       namespace N {
        op test(): void;
       }
       @myDec(N.┆)
      `
    );

    check(
      completions,
      [
        {
          label: "test",
          insertText: "test",
          kind: CompletionItemKind.Method,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "```typespec\nop N.test(): void\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes interface operations", async () => {
    const completions = await complete(
      `
       interface I {
        test(param: string): void;
       }
      
       @myDec(I.┆
      `
    );

    check(
      completions,
      [
        {
          label: "test",
          insertText: "test",
          kind: CompletionItemKind.Method,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "```typespec\nop I.test(param: string): void\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes model properties", async () => {
    const completions = await complete(
      `
       model M {
        test: string;
       }
       @myDec(M.┆
      `
    );

    check(
      completions,
      [
        {
          label: "test",
          insertText: "test",
          kind: CompletionItemKind.Field,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(model property)\n```typespec\nM.test: string\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes extended model properties", async () => {
    const completions = await complete(
      `
       model N {
        name: string;
        value: int16
       }
       model M extends N {
        test: string;
        ┆
       }
      `
    );

    check(
      completions,
      [
        {
          label: "name",
          insertText: "name",
          kind: CompletionItemKind.Field,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(model property)\n```typespec\nN.name: string\n```",
          },
        },
        {
          label: "value",
          insertText: "value",
          kind: CompletionItemKind.Field,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(model property)\n```typespec\nN.value: int16\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes extended model typing and remaining properties", async () => {
    const completions = await complete(
      `
       model N {
        name: string;
        value: int16;
        extra: boolean;
       }
       model M extends N {
        name: string;
        va┆
       }
      `
    );

    check(
      completions,
      [
        {
          label: "value",
          insertText: "value",
          kind: CompletionItemKind.Field,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(model property)\n```typespec\nN.value: int16\n```",
          },
        },
        {
          label: "extra",
          insertText: "extra",
          kind: CompletionItemKind.Field,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "(model property)\n```typespec\nN.extra: boolean\n```",
          },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes template parameter uses", async () => {
    const completions = await complete(
      `
      model Template<Param> {
        prop: ┆
      }
      `
    );

    check(completions, [
      {
        label: "Param",
        insertText: "Param",
        kind: CompletionItemKind.Struct,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "(template parameter)\n```typespec\nParam\n```",
        },
      },
    ]);
  });

  it("completes template parameter names in arguments", async () => {
    const completions = await complete(`
      model Template<Param> {
        prop: Param;
      }

      model M {
        prop: Template<P┆>;
      }
      `);

    check(completions, [
      {
        label: "Param",
        insertText: "Param = ",
        kind: CompletionItemKind.Struct,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "(template parameter)\n```typespec\nParam\n```",
        },
      },
    ]);
  });

  it("completes template parameter names in arguments with equals sign already in place", async () => {
    const completions = await complete(`
      model Template<Param> {
        prop: Param;
      }

      model M {
        prop: Template<P┆ = string>;
      }
      `);

    check(completions, [
      {
        label: "Param",
        insertText: "Param",
        kind: CompletionItemKind.Struct,
        documentation: {
          kind: MarkupKind.Markdown,
          value: "(template parameter)\n```typespec\nParam\n```",
        },
      },
    ]);
  });

  it("completes sibling in namespace", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B extends ┆
      }
        `
    );

    check(completions, [
      {
        label: "A",
        insertText: "A",
        kind: CompletionItemKind.Class,
        documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel N.A\n```" },
      },
    ]);
  });

  it("completes using statements", async () => {
    const completions = await complete(
      `
      namespace A {
        namespace B {
          model M  {}
        }
      }

      using A.┆;
      }
      `
    );

    check(
      completions,
      [
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Module,
          documentation: { kind: MarkupKind.Markdown, value: "```typespec\nnamespace A.B\n```" },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes qualified decorators", async () => {
    const js = {
      name: "test/decorators.js",
      js: {
        namespace: "Outer",
        $innerDecorator: function () {},
        $outerDecorator: function () {},
      },
    };
    (js.js.$innerDecorator as any).namespace = "Inner";

    const completions = await complete(
      `
      import "./decorators.js";
      namespace A {
        namespace B {
          model M  {}
        }
      }

      @Outer.┆
      model M {}
      `,
      js
    );
    check(
      completions,
      [
        {
          label: "Inner",
          insertText: "Inner",
          kind: CompletionItemKind.Module,
          documentation: {
            kind: MarkupKind.Markdown,
            value: "```typespec\nnamespace Outer.Inner\n```",
          },
        },
        {
          label: "outerDecorator",
          insertText: "outerDecorator",
          kind: CompletionItemKind.Function,
          documentation: undefined,
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });
  it("deals with trivia before missing identifier", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B {}
      }

      model M extends N.┆
      // single line comment
      /*
        multi-line comment
      */
      {/*<-- missing identifier immediately before this brace*/}
      `
    );

    check(
      completions,
      [
        {
          label: "A",
          insertText: "A",
          kind: CompletionItemKind.Class,
          documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel N.A\n```" },
        },
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Class,
          documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel N.B\n```" },
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("shows doc comment documentation", async () => {
    const completions = await complete(
      `
      namespace N {
        /**
         * Just an example.
         *
         * @param value The value.
         *
         * @example
         * \`\`\`typespec
         * @hello
         * model M {}
         * \`\`\`
         */
        extern dec hello(value: string);
      }
      @N.┆
      `
    );

    check(
      completions,
      [
        {
          label: "hello",
          insertText: "hello",
          kind: CompletionItemKind.Function,
          documentation: {
            kind: MarkupKind.Markdown,
            value:
              "```typespec\ndec N.hello(value: string)\n```\n\nJust an example.\n\n_@param_ `value` —\nThe value.\n\n_@example_ —\n```typespec\n@hello\nmodel M {}\n```",
          },
        },
      ],
      { fullDocs: true }
    );
  });

  it("completes aliased interface operations", async () => {
    const completions = await complete(
      `
      interface Foo {
        op Bar(): string;
      }

      alias FooAlias= Foo;
      alias A = FooAlias.┆`
    );
    check(completions, [
      {
        label: "Bar",
        insertText: "Bar",
        kind: CompletionItemKind.Method,
        documentation: {
          kind: "markdown",
          value: "```typespec\nop Foo.Bar(): string\n```",
        },
      },
    ]);
  });

  it("completes aliased model properties", async () => {
    const completions = await complete(
      `
      model Foo {
        bar: string;
      }

      alias FooAlias = Foo;
      alias A = FooAlias.┆`
    );
    check(completions, [
      {
        label: "bar",
        insertText: "bar",
        kind: CompletionItemKind.Field,
        documentation: {
          kind: "markdown",
          value: "(model property)\n```typespec\nFoo.bar: string\n```",
        },
      },
    ]);
  });

  it("completes aliased instantiated interface operations", async () => {
    const completions = await complete(
      `
      interface Foo<T> {
        op Bar(): T;
      }

      alias FooOfString = Foo<string>;
      alias A = FooOfString.┆`
    );
    check(completions, [
      {
        label: "Bar",
        insertText: "Bar",
        kind: CompletionItemKind.Method,
        documentation: {
          kind: "markdown",
          value: "```typespec\nop Foo<string>.Bar(): string\n```",
        },
      },
    ]);
  });

  it("completes aliased instantiated model properties", async () => {
    const completions = await complete(
      `
      model Foo<T> {
        bar: T;
      }

      alias FooOfString = Foo<string>;
      alias A = FooOfString.┆`
    );
    check(completions, [
      {
        label: "bar",
        insertText: "bar",
        kind: CompletionItemKind.Field,
        documentation: {
          kind: "markdown",
          value: "(model property)\n```typespec\nFoo<string>.bar: string\n```",
        },
      },
    ]);
  });

  it("completes deprecated type", async () => {
    const completions = await complete(
      `
      #deprecated "Foo is bad"
      model Foo {}

      model Bar {
        prop: ┆
      }
      `
    );

    check(completions, [
      {
        label: "Foo",
        insertText: "Foo",
        kind: CompletionItemKind.Class,
        documentation: { kind: MarkupKind.Markdown, value: "```typespec\nmodel Foo\n```" },
        tags: [CompletionItemTag.Deprecated],
      },
    ]);
  });

  it("completes deprecated alias", async () => {
    const completions = await complete(
      `
      model Foo {}

      #deprecated "AliasedFoo is bad"
      alias AliasedFoo = Foo

      model Bar {
        prop: Ali┆
      }
      `
    );

    check(completions, [
      {
        label: "AliasedFoo",
        insertText: "AliasedFoo",
        kind: CompletionItemKind.Variable,
        documentation: { kind: MarkupKind.Markdown, value: "```typespec\nalias AliasedFoo\n```" },
        tags: [CompletionItemTag.Deprecated],
      },
    ]);
  });

  describe("completion for objectliteral/arrayliteral as template parameter default value", () => {
    const def = `
      /**
       * my log context
       */
      model MyLogContext<T> {
        /**
         * name of log context 
         */
        name: string;
        /**
         * items of context
         */
        item: Array<T>;
      }
  
      /**
       * my log argument
       */
      model MyLogArg{
        /**
         * my log message
         */
        msg: string;
        /**
         * my log id
         */
        id: int16;
        /**
         * my log context
         */
        context: MyLogContext<string>[];
      }
      `;

    it("show all properties literal object, array, type", async () => {
      (
        await Promise.all(
          [
            `model TestModel<T extends MyLogArg = {┆}>{};`,
            `model TestModel<T extends valueof MyLogArg = #{┆}>{};`,
            `model TestModel<T extends MyLogArg[] = [{┆}]>{};`,
            `model TestModel<T extends valueof MyLogArg[] = #[#{┆}]>{};`,
            `model TestModel<T extends [string, MyLogArg] = ["abc", {┆}]>{};`,
            `model TestModel<T extends valueof [string, MyLogArg] = #["abc", #{┆}]>{};`,
          ].map(async (item) => await complete(`${def}\n${item}`))
        )
      ).forEach((completions) => {
        check(
          completions,
          [
            {
              label: "msg",
              insertText: "msg",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
              },
            },
            {
              label: "id",
              insertText: "id",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
              },
            },
            {
              label: "context",
              insertText: "context",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        );
      });
    });

    it("show all properties of literal model -> literal array -> literal model", async () => {
      (
        await Promise.all(
          [
            `model TestModel<T extends MyLogArg = {context: [{┆}]}>{};`,
            `model TestModel<T extends valueof MyLogArg = #{context: #[#{┆}]}>{};`,
          ].map(async (item) => await complete(`${def}\n${item}`))
        )
      ).forEach((completions) => {
        check(
          completions,
          [
            {
              label: "name",
              insertText: "name",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogContext<T>.name: string\n```\n\nname of log context",
              },
            },
            {
              label: "item",
              insertText: "item",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogContext<T>.item: Array<Element>\n```\n\nitems of context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        );
      });
    });

    it("no completion for type to value", async () => {
      const completions = await complete(
        `${def}
        model TestModel<T extends valueof MyLogArg = {┆}>{};
          `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });

    it("no completion for value to type", async () => {
      const completions = await complete(
        `${def}
        model TestModel<T extends MyLogArg = #{┆}>{};
          `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });
    it("no completion when cursor is after }", async () => {
      const completions = await complete(
        `${def}
        model TestModel<T extends MyLogArg = #{}┆>{};
          `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });
  });

  describe("completion for scalar init objectliteral/arrayliteral arg", () => {
    const def = `
    /**
     * my log context
     */
    model MyLogContext<T> {
      /**
       * name of log context 
       */
      name: string;
      /**
       * items of context
       */
      item: Array<T>;
    }

    /**
     * my log argument
     */
    model MyLogArg{
      /**
       * my log message
       */
      msg: string;
      /**
       * my log id
       */
      id: int16;
      /**
       * my log context
       */
      context: MyLogContext<string>[];
    }

    scalar TestString extends string{
      init createFromLog(value: MyLogArg);
      init createFromLog2(value: MyLogArg[]);
      init createFromLog3(value: string);
      init createFromLog4(value1: int, value2: [{arg: [MyLogArg, string]}])
    }
    `;

    it("show all properties literal model", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog(#{┆});
        `
      );
      check(
        completions,
        [
          {
            label: "msg",
            insertText: "msg",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
            },
          },
          {
            label: "id",
            insertText: "id",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
            },
          },
          {
            label: "context",
            insertText: "context",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });
    it("show all properties of literal array -> literal model", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog2(#[#{┆}]);
        `
      );
      check(
        completions,
        [
          {
            label: "msg",
            insertText: "msg",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
            },
          },
          {
            label: "id",
            insertText: "id",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
            },
          },
          {
            label: "context",
            insertText: "context",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });
    it("show all properties of tuple->object->tuple->object", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog4(1, #[#{arg:#[#{┆},"abc"]}]);
        `
      );
      check(
        completions,
        [
          {
            label: "msg",
            insertText: "msg",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
            },
          },
          {
            label: "id",
            insertText: "id",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
            },
          },
          {
            label: "context",
            insertText: "context",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });
    it("no completion for model", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog({┆});
        `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });
    it("no completion for non-literalobject type", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog3(┆);
        `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });
    it("no completion when cursor is after }", async () => {
      const completions = await complete(
        `${def}
         const c = TestString.createFromLog({}┆);
        `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });
  });

  describe("completion for const assignment of objectliteral/arrayliteral", () => {
    const def = `
    /**
     * my log context
     */
    model MyLogContext<T> {
      /**
       * name of log context 
       */
      name: string;
      /**
       * items of context
       */
      item: Array<T>;
    }

    /**
     * my log argument
     */
    model MyLogArg{
      /**
       * my log message
       */
      msg: string;
      /**
       * my log id
       */
      id: int16;
      /**
       * my log context
       */
      context: MyLogContext<string>[];
      /**
       * my log context2
       */
      context2: [MyLogContext<string>, int16];
    }
    `;
    it("show all properties literal model", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = #{┆};
        `
      );
      check(
        completions,
        [
          {
            label: "msg",
            insertText: "msg",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
            },
          },
          {
            label: "id",
            insertText: "id",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
            },
          },
          {
            label: "context",
            insertText: "context",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
            },
          },
          {
            label: "context2",
            insertText: "context2",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context2: [MyLogContext<string>, int16]\n```\n\nmy log context2",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });

    it("show all properties of literal array -> literal model", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg[] = #[#{┆}];
        `
      );
      check(
        completions,
        [
          {
            label: "msg",
            insertText: "msg",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
            },
          },
          {
            label: "id",
            insertText: "id",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
            },
          },
          {
            label: "context",
            insertText: "context",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>[]\n```\n\nmy log context",
            },
          },
          {
            label: "context2",
            insertText: "context2",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogArg.context2: [MyLogContext<string>, int16]\n```\n\nmy log context2",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });

    it("show all properties of literal model -> literal array -> literal model", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = #{context:#[#{┆}]};
        `
      );
      check(
        completions,
        [
          {
            label: "name",
            insertText: "name",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.name: string\n```\n\nname of log context",
            },
          },
          {
            label: "item",
            insertText: "item",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.item: Array<Element>\n```\n\nitems of context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });

    it("show all properties of literal model -> tuple -> literal model", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = #{context2:#[#{┆}]};
        `
      );
      check(
        completions,
        [
          {
            label: "name",
            insertText: "name",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.name: string\n```\n\nname of log context",
            },
          },
          {
            label: "item",
            insertText: "item",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.item: Array<Element>\n```\n\nitems of context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });

    it("show all properties of alias -> tuple -> literal model -> array -> literal model", async () => {
      const completions = await complete(
        `${def}
         alias A = [MyLogArg];
         const c : A = #[#{context:#[#{┆}]}];
        `
      );
      check(
        completions,
        [
          {
            label: "name",
            insertText: "name",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.name: string\n```\n\nname of log context",
            },
          },
          {
            label: "item",
            insertText: "item",
            kind: CompletionItemKind.Field,
            documentation: {
              kind: MarkupKind.Markdown,
              value:
                "(model property)\n```typespec\nMyLogContext<T>.item: Array<Element>\n```\n\nitems of context",
            },
          },
        ],
        {
          fullDocs: true,
          allowAdditionalCompletions: false,
        }
      );
    });

    it("no completion for scalar array in literal object", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = #{context:#[#{item: #[┆]}]};
        `
      );
      ok(completions.items.length === 0, "No completions expected for scalar array");
    });

    it("no completion for model", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = {┆};
        `
      );
      ok(completions.items.length === 0, "No completions expected for model");
    });

    it("no completion when cursor is after }", async () => {
      const completions = await complete(
        `${def}
         const c : MyLogArg = #{}┆;
        `
      );
      ok(completions.items.length === 0, "No completions expected after }");
    });

    it("no completion for const without type", async () => {
      const completions = await complete(
        `${def}
         const c = #{┆};
        `
      );
      ok(completions.items.length === 0, "No completions expected for const without type");
    });
  });

  describe("completion for decorator model/value argument", () => {
    const decArgModelDef = `
      import "./decorators.js";

      /**
       * my log context
       */
      model MyLogContext<T> {
        /**
         * name of log context 
         */
        name: string;
        /**
         * items of context
         */
        item: Record<T>;
      }

      /**
       * my log argument
       */
      model MyLogArg{
        /**
         * my log message
         */
        msg: string;
        /**
         * my log id
         */
        id: int16;
        /**
         * my log context
         */
        context: MyLogContext<string>;
      }

      extern dec myDec(target, arg: MyLogArg, arg2: valueof MyLogArg, arg3: [string, MyLogArg, int], arg4: valueof [MyLogArg]);
      `;

    it("show all properties", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      (
        await Promise.all(
          [
            `@myDec({┆})`,
            `@myDec({}, #{┆})`,
            `@myDec({}, {┆})`,
            `@myDec({}, {}, ["abc", {┆}, 16])`,
            `@myDec({}, {}, #[], #[#{┆}])`,
          ].map(async (dec) => {
            return await complete(
              `${decArgModelDef}
        ${dec}
        model M {}
        `,
              js
            );
          })
        )
      ).forEach((completions) =>
        check(
          completions,
          [
            {
              label: "msg",
              insertText: "msg",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value: "(model property)\n```typespec\nMyLogArg.msg: string\n```\n\nmy log message",
              },
            },
            {
              label: "id",
              insertText: "id",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
              },
            },
            {
              label: "context",
              insertText: "context",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>\n```\n\nmy log context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        )
      );

      const result = await complete(
        `${decArgModelDef}
        @myDec(#{┆})
        model M {}
        `,
        js
      );
      ok(result.items.length === 0, "No completions expected when value is used for type");
    });

    it("show all properties of nested model", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      (
        await Promise.all(
          [
            `@myDec({ context: {┆} })`,
            `@myDec({ context: {} }, #{ context: #{┆} })`,
            `@myDec({ context: {} }, { context: {┆} })`,
          ].map(async (dec) => {
            return await complete(
              `${decArgModelDef}
          ${dec}
          model M {}
          `,
              js
            );
          })
        )
      ).forEach((completions) => {
        check(
          completions,
          [
            {
              label: "name",
              insertText: "name",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogContext<T>.name: string\n```\n\nname of log context",
              },
            },
            {
              label: "item",
              insertText: "item",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogContext<T>.item: Record<Element>\n```\n\nitems of context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        );
      });

      const result = await complete(
        `${decArgModelDef}
        @myDec(#{ context: #{┆} }, { context: {} })
        model M {}
        `,
        js
      );
      ok(result.items.length === 0, "No completions expected when value is used for type");
    });

    it("show the left properties", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      (
        await Promise.all(
          [
            `@myDec({ context: { name: "abc", ┆} })`,
            `@myDec({}, #{ context: #{ name: "abc", ┆} })`,
            `@myDec({}, { context: { name: "abc", ┆} })`,
          ].map(async (dec) => {
            return await complete(
              `${decArgModelDef}
        ${dec}
        model M {}
        `,
              js
            );
          })
        )
      ).forEach((completions) => {
        check(
          completions,
          [
            {
              label: "item",
              insertText: "item",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogContext<T>.item: Record<Element>\n```\n\nitems of context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        );
      });
      const result = await complete(
        `${decArgModelDef}
      @myDec(#{ context: #{ name: "abc", ┆} })
      model M {}
      `,
        js
      );
      ok(result.items.length === 0, "No completions expected when value is used for type");
    });

    it("show the typing and left properties", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      (
        await Promise.all(
          [
            `@myDec({ msg: "msg", conte┆xt})`,
            `@myDec({}, { msg: "msg", conte┆xt})`,
            `@myDec({}, #{ msg: "msg", conte┆xt})`,
          ].map(async (dec) => {
            return await complete(
              `${decArgModelDef}
        ${dec}
        model M {}
        `,
              js
            );
          })
        )
      ).forEach((completions) =>
        check(
          completions,
          [
            {
              label: "id",
              insertText: "id",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value: "(model property)\n```typespec\nMyLogArg.id: int16\n```\n\nmy log id",
              },
            },
            {
              label: "context",
              insertText: "context",
              kind: CompletionItemKind.Field,
              documentation: {
                kind: MarkupKind.Markdown,
                value:
                  "(model property)\n```typespec\nMyLogArg.context: MyLogContext<string>\n```\n\nmy log context",
              },
            },
          ],
          {
            fullDocs: true,
            allowAdditionalCompletions: false,
          }
        )
      );
      const result = await complete(
        `${decArgModelDef}
      @myDec(#{ msg: "msg", conte┆xt})
      model M {}
      `,
        js
      );
      ok(result.items.length === 0, "No completions expected when value is used for type");
    });

    it("no completion when cursor is after }", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      const completions = await complete(
        `${decArgModelDef}
        @myDec({}┆)
        model M {}
        `,
        js
      );
      ok(completions.items.length === 0, "No completions expected when cursor is after }");
    });

    it("no completion when the model expression is not decorator argument value", async () => {
      const js = {
        name: "test/decorators.js",
        js: {
          $myDec: function () {},
        },
      };

      const completions = await complete(
        `${decArgModelDef}
        @myDec({})
        model M {}

        op op1() : {
          na┆me: string;
          value: string
        }
        `,
        js
      );
      ok(completions.items.length === 0, "No completions expected for normal model expression }");
    });
  });

  describe("directives", () => {
    it("complete directives when starting with `#`", async () => {
      const completions = await complete(
        `
        #┆
        model Bar {}
        `
      );

      check(completions, [
        {
          label: "suppress",
          kind: CompletionItemKind.Keyword,
        },
        {
          label: "deprecated",
          kind: CompletionItemKind.Keyword,
        },
      ]);
    });

    it("doesn't complete when in the argument section", async () => {
      const completions = await complete(
        `
        #suppress s┆
        model Bar {}
        `
      );

      check(completions, []);
    });
  });
});

function check(
  list: CompletionList,
  expectedItems: CompletionItem[],
  options?: {
    allowAdditionalCompletions?: boolean;
    fullDocs?: boolean;
  }
) {
  options = {
    allowAdditionalCompletions: true,
    fullDocs: false,
    ...options,
  };

  ok(!list.isIncomplete, "list should not be incomplete.");

  const expectedMap = new Map(expectedItems.map((i) => [i.label, i]));
  strictEqual(expectedMap.size, expectedItems.length, "Duplicate labels in expected completions.");

  const actualMap = new Map(list.items.map((i) => [i.label, i]));
  strictEqual(actualMap.size, list.items.length, "Duplicate labels in actual completions.");

  for (const expected of expectedItems) {
    const actual = actualMap.get(expected.label);

    // Unless given the fullDocs option, tests only give their expectation for the first
    // markdown paragraph.
    if (
      !options.fullDocs &&
      typeof actual?.documentation === "object" &&
      actual.documentation.value.indexOf("\n\n") > 0
    ) {
      actual.documentation = {
        kind: MarkupKind.Markdown,
        value: actual.documentation.value.substring(0, actual.documentation.value.indexOf("\n\n")),
      };
    }

    ok(
      actual,
      `Expected completion item not found: '${expected.label}'. Available: ${list.items.map((x) => x.label).join(", ")}`
    );
    deepStrictEqual(actual, expected);
    actualMap.delete(actual.label);
    expectedMap.delete(expected.label);
  }

  const expectedRemaining = Array.from(expectedMap.values());
  deepStrictEqual(expectedRemaining, [], "Not all expected completions were found.");

  if (!options.allowAdditionalCompletions) {
    const actualRemaining = Array.from(actualMap.values());
    deepStrictEqual(actualRemaining, [], "Extra completions were found.");
  }
}

async function complete(
  sourceWithCursor: string,
  jsSourceFile?: { name: string; js: Record<string, any> },
  additionalFiles?: Record<string, string>
): Promise<CompletionList> {
  const { source, pos } = extractCursor(sourceWithCursor);
  const testHost = await createTestServerHost();
  if (jsSourceFile) {
    testHost.addJsFile(jsSourceFile.name, jsSourceFile.js);
  }
  if (additionalFiles) {
    for (const [key, value] of Object.entries(additionalFiles)) {
      testHost.addTypeSpecFile(key, value);
    }
  }
  testHost.addTypeSpecFile("main.tsp", 'import "./test/test.tsp";');
  const textDocument = testHost.addOrUpdateDocument("test/test.tsp", source);
  return await testHost.server.complete({
    textDocument,
    position: textDocument.positionAt(pos),
  });
}
