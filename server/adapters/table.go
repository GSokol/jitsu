package adapters

import (
	"github.com/jitsucom/jitsu/server/typing"
	"reflect"
)

//Columns is a list of columns representation
type Columns map[string]typing.SQLColumn

//TableField is a table column representation
type TableField struct {
	Field string      `json:"field,omitempty"`
	Type  string      `json:"type,omitempty"`
	Value interface{} `json:"value,omitempty"`
}


//Table is a dto for DWH Table representation
type Table struct {
	Name           string
	Columns        Columns
	PKFields       map[string]bool
	DeletePkFields bool
	Version        int64
}

//Exists returns true if there is at least one column
func (t *Table) Exists() bool {
	if t == nil {
		return false
	}

	return len(t.Columns) > 0 || len(t.PKFields) > 0 || t.DeletePkFields
}

//GetPKFields returns primary keys list
func (t *Table) GetPKFields() []string {
	var pkFields []string
	for pkField := range t.PKFields {
		pkFields = append(pkFields, pkField)
	}

	return pkFields
}

//GetPKFieldsMap returns primary keys set
func (t *Table) GetPKFieldsMap() map[string]bool {
	pkFields := make(map[string]bool, len(t.PKFields))
	for name := range t.PKFields {
		pkFields[name] = true
	}

	return pkFields
}

// Diff calculates diff between current schema and another one.
// Return schema to add to current schema (for being equal) or empty if
// 1) another one is empty
// 2) all fields from another schema exist in current schema
// NOTE: Diff method doesn't take types into account
func (t Table) Diff(another *Table) *Table {
	diff := &Table{Name: t.Name, Columns: map[string]typing.SQLColumn{}, PKFields: map[string]bool{}}

	if !another.Exists() {
		return diff
	}

	for name, column := range another.Columns {
		_, ok := t.Columns[name]
		if !ok {
			diff.Columns[name] = column
		}
	}

	//primary keys logic
	if len(t.PKFields) > 0 && len(another.PKFields) == 0 {
		//only delete
		diff.DeletePkFields = true
	} else {
		if len(t.PKFields) == 0 && len(another.PKFields) > 0 {
			//create
			diff.PKFields = another.PKFields
		} else if !reflect.DeepEqual(t.PKFields, another.PKFields) {
			//re-create
			diff.DeletePkFields = true
			diff.PKFields = another.PKFields
		}
	}

	return diff
}
