**LynxContract – Unified Contract Annotation Language for Python & Go (v0.2, 2025-07-05)**

---

## 1 Purpose & Design Goals
- **One syntax, two ecosystems** – Works in *Python ≥3.9* and *Go ≥1.22* without breaking their toolchains.
- **Human-friendly / GPT-friendly** – Plain-text YAML fragment that LLMs parse trivially; no exotic symbols.
- **Zero-cost in prod** – Contracts can be compiled-out with a single build flag (`lynxcontracts=off`).
- **Incremental adoption** – Entire file, class, func or even single line.

---

## 2 Annotation Marker & Placement
| Language | Marker | Placement | Example |
|----------|--------|-----------|---------|
| **Python** | `#@` | Immediately before `def`/`class`/`module` top | `#@contract:` |
| **Go** | `//@` | Immediately before `func`/`type`/package decl | `//@contract:` |

A block **begins** with `#@contract:` (Python) or `//@contract:` (Go) and continues while each subsequent line starts with the same marker.

```python
#@contract:
#@  pre: n >= 0
#@  post: result**2 >= n
#@  raises: ValueError if n < 0
#@end
```
The optional `#@end`/`//@end` sentinel is only needed when mixing with other block comments.

---

## 3 Core Keys
| Key       | Type       | Meaning                                        |
|-----------|------------|------------------------------------------------|
| `pre`     | list/expr  | Conditions caller must satisfy.               |
| `post`    | list/expr  | Conditions callee guarantees on return.       |
| `inv`     | list/expr  | Invariants that hold before **and** after each public method. |
| `raises`  | map        | `ErrorType: predicate` pairs of allowed exceptions & when they may occur. |
| `assigns` | list       | Fields or globals the routine is allowed to mutate (empty ⇒ pure). |

Any key may be omitted. Single-line shorthand: `#@pre: x != 0`.

---

## 4 Expression Language
A tiny, language-agnostic subset close to Python semantics.

```ebnf
expr       = disjunction
old_call   = "old(" ident ")"           ; value at routine entry
result_kw  = "result"                    ; return value
ident      = /[A-Za-z_][A-Za-z0-9_]*/
```

Supported ops: `+ - * / // % **`, comparisons `== != < <= > >=`, boolean `and or not`, membership `in`, slicing `seq[i:j]`, & built-ins:
- `len(x)`
- `all(iterable)` `any(iterable)`
- Quantifiers: `forall var in iter: expr`, `exists var in iter: expr` (desugar to `all`/`any`).
- `old(x)` snapshot, `result` keyword, `self`/`this` or receiver.

**Side-effect-free!** Expressions must not mutate state.

---

## 5 Scoping & Nullables
- Function params & locals visible in `post`.
- `old()` allowed only in `post` & `inv`.
- In a method, `self` (`this` in Go receivers) refers to current object; `old(self.field)` allowed.

---

## 6 Tooling Contract Modes
| Mode     | Behavior                                               |
|----------|--------------------------------------------------------|
| `VERIFY` *(default dev)* | Inject runtime checks; fatal on violation.     |
| `ASSUME` *(staging)*     | Evaluate `pre` once, skip heavy quantifiers in `post`. |
| `OFF` *(prod)*           | Entire blocks stripped at build time.         |

Enable via env var `LYNXCONTRACT=OFF/ASSUME/VERIFY` or Go build tag `-tags lynxcontracts`.

---

## 7·1 Python
```python
#@contract:
#@  pre: amount > 0 and self.balance >= amount
#@  post:
#@    - self.balance == old(self.balance) - amount
#@    - result is None
#@  raises: ValueError if amount <= 0
class Account:
    def withdraw(self, amount: int):
        if amount <= 0:
            raise ValueError
        self.balance -= amount
```

## 7·2 Go
```go
//@contract:
//@  pre: len(name) > 0 && age >= 0
//@  post: result.Error == nil && result.Id > 0
func CreateUser(name string, age int) (User, error) {
    ...
}
```

---

## 8 Class / Type Invariants
- **Python**: place a `#@contract:` block immediately above `class` with only `inv:`.
- **Go**: attach to the `type` block.

Contracts auto-wrap every exported method.

---

## 9 Edge Cases & Escapes
| Need                 | Solution                                      |
|----------------------|-----------------------------------------------|
| Multi-line expression | Indent >2 spaces under list item              |
| Disable single check | Prefix with `~` e.g. `~ amount > 0`           |
| Language-specific code | Use fenced verbatim: `{{py: … }}` or `{{go: … }}` inside expr |

---

## 10 Compatibility & Extensibility
- Forward-compatible: unknown keys ignored with warning.
- Versions: optional `version: "0.2"` key inside block.
- Roadmap: quantified `let` bindings, separation logic `modifies`, SMT export for static proofs.

---

## 11 Architecture & Data-flow Contracts
LynxContract can also capture **module-level relationships and runtime dataflow** so that build tools (and ChatGPT!) can reason about an entire codebase.

### 11·1 Module Contract Block (`module:`)
Marker | Python | Go
------ | ------ | ---
Begin | `#@module:` | `//@module:`
Continue | `#@`-prefixed | `//@`-prefixed
End (opt.) | `#@end` | `//@end`

**Keys**
| Key | Type | Description |
|-----|------|-------------|
| `layer` | string | *Architectural layer* (e.g. `domain`, `app`, `infra`, `ui`). |
| `depends` | list | **Outgoing** dependencies this module is **allowed** to import/use. Wildcards with `*` OK. |
| `exposes` | list | Public API surface (funcs, types, endpoints) the module *guarantees* to keep stable. |
| `restrictions` | list | Modules **forbidden** to depend on this one (inversion rule). |
| `doc` | string | Free-text rationale / ADR link. |

> **Rule** – The build-time verifier ensures: `imports(actual) − allowed(depends) == ∅` and `reverseImports(actual) ∩ restrictions == ∅`.

**Example (Python)**
```python
#@module:
#@  layer: app
#@  depends: [domain.*, util.logger]
#@  exposes: [CreateUser, DeleteUser]
#@  restrictions: [infra.*]
class UserService: ...
```

### 11·2 Data-flow Contract Block (`flow:`)
**Purpose.** Document how data items travel through code, services, queues, DB tables, etc.—useful for security, privacy, and performance analysis.

```go
//@flow:
//@  from: http.POST /users
//@  through:
//@    - ValidateInput
//@    - CreateUser -> db.table users
//@  to: eventbus.UserCreated
func CreateUserHandler(w http.ResponseWriter, r *http.Request) { ... }
```

**Keys**
| Key | Type | Description |
|-----|------|-------------|
| `from` | endpoint / topic / file | Source of the data. |
| `through` | list of nodes | Ordered processing steps. Use `func`, `module`, or `resource -> target`. |
| `to` | endpoint / topic / file | Final sink. |
| `privacy` | string | Data classification (`public`, `internal`, `pii`, `phi`, …). |
| `rate` | string | Expected throughput, e.g. `msg/s`, `MiB/min`. |

**Node Grammar**
```
node        ::= IDENT | IDENT '.' IDENT | resource '->' target
resource    ::= 'db' | 'cache' | 'queue' | 'file' | IDENT
```

### 11·3 Visualization & Static Checks
- **Diagram export:** `lynxctl graph –format=svg` renders module layers and flows.
- **Cycle detection:** Tool detects forbidden circular dependencies (`layer` ordering).
- **Privacy lint:** If a `privacy: pii` flow reaches a `public` sink, linter errors.

---

## 12 Versioning Note
This extension bumps the spec version to **0.2**. Add
```yaml
version: "0.2"
```
to the top of any contract block to declare compliance.

---

© 2025 LynxContract Authors. MIT License.
