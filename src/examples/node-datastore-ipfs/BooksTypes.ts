import { BasicType, Metamodel, createMetamodel, createEntityType, createAttribute } from "../../persistence/Meta.js"
import { Author, Book } from "./BooksModel.js"

export const StringType: BasicType<String> = { factory: typeof String }

export const AuthorType = createEntityType(Author, [
    createAttribute({ name: "firstname", type: StringType, association: false, key: false }),
    createAttribute({ name: "lastname", type: StringType, association: false, key: false }),
])

export const BookType = createEntityType(Book, [
    createAttribute({ name: "title", type: StringType, association: false, key: false }),
    createAttribute({ name: "author", type: AuthorType, association: true, key: false })
])

export const Repository: Metamodel = createMetamodel([AuthorType, BookType])