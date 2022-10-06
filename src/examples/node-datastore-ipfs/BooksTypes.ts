import { BasicType, EntityType, Metamodel, createMetamodel } from "../../persistence/Meta.js"
import { Author, Book } from "./BooksModel.js"

export const StringType: BasicType<String> = { type: typeof String }

export const AuthorType: EntityType<Author> = {
    type: Author,
    attributes: [
        { name: "firstname", type: StringType, association: false, key: false },
        { name: "lastname", type: StringType, association: false, key: false },
    ]
}
export const BookType: EntityType<Book> = {
    type: Book,
    attributes: [
        { name: "title", type: StringType, association: false, key: false },
        { name: "author", type: AuthorType, association: true, key: false },
    ]
}

export const Repository: Metamodel = createMetamodel([AuthorType, BookType])