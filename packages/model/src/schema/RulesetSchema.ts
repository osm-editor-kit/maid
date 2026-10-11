import './globals.d.ts';
import { Ruleset } from './Ruleset.ts';
import { Variable } from './Variable.ts';

import type { Context, SchemaLookup } from '../Context.ts';
import type { TagKeyValueLookup } from '../data/types.ts';
import type { RulesetProps } from './Ruleset.ts';
import type { VariableProps, VariableValue } from './Variable.ts';


/** Input format of a rulesets file such as `osm_rulesets.json5`. Same shape as Rapid's `SchemaInput`, minus presets, fields, categories. */
export interface RulesetsInput {
  assetID: AssetID;
  assetVersion?: string;
  scopes?: RulesetsInputScope[];
}

export interface RulesetsInputScope {
  scope: ScopeID;
  /** VariableID to value (or null to delete) */
  variables?: Record<VariableID, VariableValue | null>;
  /** RulesetID to props (or null to delete) */
  rulesets?: Record<RulesetID, Partial<RulesetProps> | null>;
}

/** The data of one scope, as far as the model uses it. */
export interface RulesetScope {
  variables: Map<VariableID, Variable>;
  rulesets: Map<RulesetID, Ruleset>;
  /**
   * Keeplist/discardlist for area detection. Rapid derives it from presets; the model has no
   * presets, so it stays empty until a caller sets it (`OsmWay#isArea` then relies on the rulesets).
   */
  areaKeys: TagKeyValueLookup;
}


/**
 * A small `SchemaLookup`: the variables and rulesets of Rapid's tagging schema, without presets,
 * fields, categories or localisation. Ported from the `merge`, `getScope` and
 * `removeLifecyclePrefix` methods of Rapid's `SchemaSystem` (modules/core/SchemaSystem.ts).
 */
export class RulesetSchema implements SchemaLookup {
  public context: Context;
  protected _scopes: Map<ScopeID, RulesetScope> = new Map();
  protected _loadedAssetIDs: Map<AssetID, string> = new Map();

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Merge a rulesets file. Variables are merged before rulesets (rulesets may use `var()`).
   * A `null` value deletes the entry; `*` and `?` work as wildcards in deletes.
   * @throws if the data has no `assetID` or the `assetID` was already merged
   */
  public merge(input: RulesetsInput): void {
    const assetID = input.assetID;
    const assetVersion = input.assetVersion ?? 'unknown';
    if (!assetID) throw new Error('Schema missing assetID property');
    if (this._loadedAssetIDs.has(assetID)) throw new Error(`Schema "${assetID}" already merged`);
    this._loadedAssetIDs.set(assetID, assetVersion);

    for (const inputScope of input.scopes ?? []) {
      const scopeID = inputScope.scope ?? 'osm';
      const scope = this.getScope(scopeID);

      for (const [variableID, value] of Object.entries(inputScope.variables ?? {})) {
        if (value !== null && value !== undefined) {
          const varProps: Partial<VariableProps> = { id: variableID, assetID, scopeID, value };
          scope.variables.set(variableID, new Variable(this.context, varProps));
        } else {
          wildcardDelete(scope.variables, variableID);
        }
      }

      for (const [rulesetID, props] of Object.entries(inputScope.rulesets ?? {})) {
        if (props) {
          const setProps = { ...props, id: rulesetID, assetID, assetVersion, scopeID } as Partial<RulesetProps>;
          scope.rulesets.set(rulesetID, new Ruleset(this.context, setProps));
        } else {
          wildcardDelete(scope.rulesets, rulesetID);
        }
      }
    }

    this._schemaChanged();
  }

  /** The data of a scope. Created empty if it does not exist yet. */
  public getScope(scopeID: ScopeID): RulesetScope {
    let scope = this._scopes.get(scopeID);
    if (!scope) {
      scope = { variables: new Map(), rulesets: new Map(), areaKeys: {} };
      this._scopes.set(scopeID, scope);
    }
    return scope;
  }

  /** Removes a lifecycle prefix such as 'disused:' from a key, using the `lifecycle_prefixes` variable. */
  public removeLifecyclePrefix(key: string, scopeID: ScopeID = 'osm'): string {
    const colonIndex = key.indexOf(':');
    if (colonIndex === -1) return key;

    const lifecyclePrefixes = this.getScope(scopeID).variables.get('lifecycle_prefixes')?.asSet();
    const prefix = key.slice(0, colonIndex);
    if (lifecyclePrefixes?.has(prefix)) {
      return key.slice(colonIndex + 1);
    }
    return key;
  }

  /** There are no presets in this schema, so nothing ever matches. */
  public matchTags(_tags: Record<string, string>, _geometry: string): undefined {
    return undefined;
  }

  /** Resolve `var()` references in rulesets against the scope's variables. */
  protected _schemaChanged(): void {
    for (const scope of this._scopes.values()) {
      for (const ruleset of scope.rulesets.values()) {
        ruleset.reset();
        ruleset.resolveVariables(scope.variables);
      }
    }
  }
}


/** Delete keys matching a pattern with '*' and '?' wildcards (Rapid: `utilWildcardDelete`). */
function wildcardDelete(collection: Map<string, unknown>, pattern: string): void {
  if (typeof pattern !== 'string') return;
  if (/[*?]/.test(pattern)) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    for (const k of [...collection.keys()]) {
      if (re.test(k)) collection.delete(k);
    }
  } else {
    collection.delete(pattern);
  }
}
